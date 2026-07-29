# Glossary — Ploeg

*Generated from `model.yaml` — do not edit by hand.*

## Agent Container
*Context: Harness*

The container a Run executes: a Harness plus its Adapter, invoked with a Task Spec and obligated to write an Outcome Report before exit. Credentials arrive out-of-band as mounted secrets, never in the spec.

**See also:** [Run](#run), [Task Spec](#task-spec), [Outcome Report](#outcome-report)  

## Assignment
*Context: Dispatch*

The normalized tracker event that offers an ingested Work Item to agents, transitioning it to queued. Assigning in the tracker is the sole human gesture that puts work in front of agents; which Team and which Work Target it resolves to is decided by the Routing Rules, never carried in the event.

**See also:** [Tracker Event](#tracker-event), [Routing Rule](#routing-rule), [Team Queue](#team-queue)  

## Checkpoint
*Context: Dispatch*

The small durable progress record (phase, branch, PR URL) a Run writes via the report API. Resume means respawning with the last Checkpoint injected; everything else is re-derived from git/forge state, which stays the durable medium.

**See also:** [Run](#run), [Task Spec](#task-spec)  

## Executor
*Context: Execution*

The pluggable component that spawns, watches, and cancels Runs. Its watch — not agent goodwill — records Job termination, feeding the lease manager and audit log. The default implementation is a KEDA ScaledJob per Team with the Postgres scaler; KEDA is a detail, not identity.

**See also:** [Run](#run)  

## Follow-Up
*Context: Dispatch*

A Work Item created from a Forge Event (review submitted, check failed, merge-state dirty) rather than from an Assignment. It references its source PR and Work Item, carries that Work Item's Work Target, is routed to the Team owning the source branch, and enters the lifecycle directly at queued — there is no Tracker Item to mirror at creation time.

**See also:** [Work Item](#work-item), [Forge Event](#forge-event), [Team](#team), [Work Target](#work-target)  

## Forge
*Context: Integration*

One registered git forge instance: id, endpoint, dialect, git identity, credential source. A Work Target names a Forge by id and the registry resolves the rest, so no Work Item ever carries a URL or a token. Distinct from a Forge Provider, which is the adapter speaking one Forge's dialect.

**Examples:** the in-cluster Forgejo instance; a second Forgejo; github.com  
**See also:** [Forge Provider](#forge-provider), [Work Target](#work-target)  

## Forge Event
*Context: Integration*

The normalized result of parsing a forge webhook — review_submitted, check_failed, or merge_state_dirty — with the Work Target, PR, branch, and the feedback body for classification. Source of every Follow-Up; carrying a Work Target is what lets the follow-up path and the assignment path converge on one type.

**See also:** [Follow-Up](#follow-up), [Forge Provider](#forge-provider), [Work Target](#work-target)  

## Forge Provider
*Context: Integration*

The SPI adapter for one git forge: verify and parse webhooks into normalized Forge Events and write back PR comments. Reference implementation: Forgejo. The adapter, not the instance it speaks to — that is a Forge.

**See also:** [Tracker Provider](#tracker-provider), [Forge Event](#forge-event), [Forge](#forge)  

## Harness
*Context: Harness*

A concrete agent tool (Claude Code, opencode, …). Ploeg never talks to a Harness directly — only through a Harness Adapter — because this boundary churns fastest of any in the system.

**See also:** [Harness Adapter](#harness-adapter), [Agent Container](#agent-container)  

## Harness Adapter
*Context: Harness*

The thin wrapper that makes one Harness satisfy the harness contract: accept a Task Spec, drive the tool, emit an Outcome Report. Adapters are the isolation layer for harness churn; ACP is tracked as a candidate standard to adopt instead of inventing more.

**See also:** [Harness](#harness), [Task Spec](#task-spec), [Outcome Report](#outcome-report)  

## Lease
*Context: Dispatch*

A Team's crash-safe hold on a Work Item: a row (team, work item, expires_at), unique per Work Item, renewed on a fixed interval by the running Run. Expiry releases the item mechanically — nothing depends on an agent behaving well at death. "Claim" is the verb (a team claims an item, acquiring a Lease); the noun is always Lease.

**Do not use:** claim (as a noun), lock  
**See also:** [Team](#team), [Work Item](#work-item), [Run](#run)  

## Outcome
*Context: Dispatch*

The terminal result of a Run, one of: pr_opened, pr_updated, issue_updated, follow_up_created, stuck, failed, no_change_needed. A stuck Outcome carries a mandatory reason and moves the Work Item to needs_human; a failed Outcome releases the Lease for retry.

**See also:** [Outcome Report](#outcome-report), [Run](#run)  

## Outcome Report
*Context: Harness*

The output contract of an Agent Container: Outcome, summary, links, and optionally a new Checkpoint, written before exit. Exit without a report is recorded as a failed Outcome by the Executor's watch.

**See also:** [Task Spec](#task-spec), [Outcome](#outcome)  

## Role
*Context: Dispatch*

A named specialist function within a Team (implementer, reviewer, tester), bound to a harness image and model. A Role is a slot in the manifest; a Run is one execution of that slot.

**Also known as:** specialist, specialist role  
**See also:** [Team](#team), [Run](#run)  

## Routing Rule
*Context: Dispatch*

The operator-declared mapping from (provider, Scope, actor, hint) to a Team and a Work Target. Rules are ordered and first-match-wins, evaluated once at ingest; an event that matches no rule is never dispatched. The set of Work Targets reachable through the rules is closed and operator-declared, so a hint selects among registered routes and can never construct one (R11).

**Do not use:** team map  
**See also:** [Scope](#scope), [Work Target](#work-target), [Team](#team), [Tracker Event](#tracker-event)  

## Run
*Context: Execution*

One execution of one Role against a leased Work Item, realized as exactly one Kubernetes Job. A Lease may accumulate several Runs (roles, retries, resumes); each Run ends in an Outcome Report or is recorded as failed by the Executor's watch. "Job" is reserved for the Kubernetes object and is never a domain term.

**Do not use:** job (as a domain term)  
**See also:** [Role](#role), [Outcome](#outcome), [Outcome Report](#outcome-report), [Executor](#executor)  

## Scope
*Context: Integration*

An opaque, provider-scoped container id for a body of work (a Vikunja project, a Jira project, a GitHub repository), carried on every Tracker Event. Ploeg compares a Scope for equality against Routing Rule keys and never parses, splits, or otherwise interprets it — equality-only is the test that keeps a vendor concept out of the core (R7).

**Also known as:** container id  
**See also:** [Tracker Event](#tracker-event), [Routing Rule](#routing-rule), [Tracker Provider](#tracker-provider)  

## Task Spec
*Context: Harness*

The input contract of an Agent Container: Work Item snapshot, Role, optional Checkpoint, and the Work Item's Work Target together with the forge endpoint its Forge id resolves to. Injected as a file mount or environment; deliberately credential-free (R8).

**See also:** [Outcome Report](#outcome-report), [Agent Container](#agent-container), [Work Target](#work-target), [Forge](#forge)  

## Team
*Context: Dispatch*

A declarative manifest — name, Roles, harness image and model per Role, run strategy (sequential or parallel), resource/token budget, concurrency cap — that is the unit of claiming. Leases are team-scoped: two Teams never hold the same Work Item; any number of Roles work within one Team's Lease. A Team never names a repository, forge, or credential: capacity and codebase are independent axes (R11).

**Do not use:** crew  
**Examples:** implementer + reviewer-on-a-different-model-family + tester  
**See also:** [Role](#role), [Lease](#lease), [Work Target](#work-target)  

## Team Queue
*Context: Dispatch*

The ordered set of queued Work Items for one Team — a derived view, not a stored entity. Order mirrors the tracker's priority/rank, falling back to oldest-first; Ploeg never owns prioritization, the board does.

**Also known as:** pick-up queue  
**See also:** [Assignment](#assignment), [Work Item](#work-item)  

## Tracker Event
*Context: Integration*

The normalized result of parsing a tracker webhook — assigned, updated, or unassigned — carrying the external id, the provider's Scope, the actor, and normalized hints. It never carries a Ploeg Team or a repository: choosing either is core policy, decided by the Routing Rules (R7). The core only ever sees normalized events, never raw vendor payloads.

**See also:** [Assignment](#assignment), [Tracker Provider](#tracker-provider), [Scope](#scope), [Routing Rule](#routing-rule)  

## Tracker Item
*Context: Integration*

The authoritative item in the external tracker (Vikunja, Jira, GitHub Issues, …). Ploeg reads it via a Tracker Provider and mirrors it into a Work Item; all content edits happen in the tracker, never in Ploeg.

**Also known as:** ticket, issue  
**See also:** [Work Item](#work-item), [Tracker Provider](#tracker-provider)  

## Tracker Provider
*Context: Integration*

The SPI adapter for one task-management system: verify and parse webhooks into normalized Tracker Events, fetch items for mirroring, and write back comments and status. Reference implementation: Vikunja.

**See also:** [Forge Provider](#forge-provider), [Tracker Event](#tracker-event)  

## Work Item
*Context: Dispatch*

Ploeg's mirror of one Tracker Item (provider + external id + revision), carrying the Dispatch lifecycle state. It never replaces the Tracker Item, which remains authoritative for content; the Work Item is authoritative only for how execution is going.

**Do not use:** task, ticket  
**See also:** [Tracker Item](#tracker-item), [Lease](#lease), [Follow-Up](#follow-up), [Work Target](#work-target)  

## Work Target
*Context: Dispatch*

The forge coordinates a Work Item's Runs act on: forge, owner, repository, base branch. Resolved at ingest from the Scope the item arrived in, pinned on the Work Item, and independent of the Team that claims it — a Team never names one. A coordinate, not a connection: it carries a forge id, never a URL and never a credential (R8).

**Also known as:** target  
**Do not use:** team repo, repo_url  
**See also:** [Work Item](#work-item), [Forge](#forge), [Routing Rule](#routing-rule), [Team](#team)  

---

## Example dialogues

Short exchanges showing the terms used precisely at concept boundaries.

### Lease vs claim, and what a crash does
*Context: Dispatch*

> **Dev:** The implementer pod got OOM-killed halfway. Who cleans up its claim?
> **Domain expert:** Nobody, and that's the point. The **Lease** just stops being renewed and expires. Per **R2**, expiry releases the **Work Item** mechanically — no cleanup code runs.
> **Dev:** So the item is lost?
> **Domain expert:** No, it goes back to queued and another **Run** picks it up with the last **Checkpoint** injected. If that keeps happening, **R5** trips it to stale so we stop burning tokens.
> **Dev:** And "claim" — is that a table?
> **Domain expert:** A verb. A **Team** claims an item, which means it acquires a **Lease**. If you're writing SQL, the noun is always Lease.

### stuck vs failed vs needs_human
*Context: Dispatch*

> **Dev:** The agent container exited zero but never wrote anything. Is that stuck?
> **Domain expert:** That's failed — exit without an **Outcome Report** is recorded as a failed **Outcome** by the **Executor**'s watch (**R3**). The item re-queues for retry.
> **Dev:** Then what's stuck?
> **Domain expert:** stuck is the agent saying "I understand the task and I cannot proceed" — it must give a reason (**R4**), and the **Work Item** goes to needs_human, not back to the queue.
> **Dev:** And stale?
> **Domain expert:** stale means the machinery gave up — repeated **Lease** expiries with no Outcome at all. needs_human is the agent asking for help; stale is Ploeg refusing to retry blindly.

---

## ⚠ Flagged ambiguities

### follow-up mirroring

Follow-Ups enter at queued with no Tracker Item, which tensions with "the tracker is the source of truth for what to do" — work now exists that the board cannot see.

**Options:** Keep Follow-Ups tracker-invisible (current), Asynchronously write a Tracker Item back for every Follow-Up, Write back only Follow-Ups that survive longer than one Run  
**Recommendation:** Revisit in roadmap phase 2 (PR-feedback ingestion); async write-back is the likely answer so the board regains full visibility without blocking dispatch.  

### groomer run

The design says Ploeg "can schedule a groomer run" but grooming semantics belong to the operator — it is unclear whether Groomer is Ploeg vocabulary at all, and what distinguishes a groomer run from a normal Run.

**Options:** Keep Groomer out of the core language (operator concern), Define it as a Team with a single grooming Role, First-class GroomerRun concept  
**Recommendation:** Keep it out of the core language for now; if it lands in phase 2, model it as an ordinary Team whose single Role grooms — no new concepts.  

## Resolved ambiguities

- **claim** — Lease is canonical for the entity; "claim" is the verb for acquiring one; "claim" as a noun is on the avoid list. (2026-07-22)
- **run vs job** — Run is per-Role, per-Job; "Job" stays a Kubernetes term. A lease-level grouping term is deliberately not introduced until parallel strategies demand one. (2026-07-22)
- **needs_human** — needs_human is a Work Item state, entered on a stuck Outcome or vague/security-sensitive Forge Event feedback; exits are human re-queue or human close. Distinct from stale, which means retry-exhausted. (2026-07-22)
- **forge vs forge provider** — Forge is the instance (a registry entry, named by a Work Target's forge id); Forge Provider is the adapter that speaks its dialect. A bare "forge" always means the instance; the adapter is always written in full. (2026-07-29)
