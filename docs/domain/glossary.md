---
type: reference
audience: [owner, integrator, contributor, agent]
owner: unfold
generated_by: "mise run domain"
---

# Glossary — Unfold

*Generated from `model.yaml` — do not edit by hand.*

The [combined Unfold glossary](../reference/glossary.md) lists every term of every model once, with its owner and the words it must not be confused with.

## Acceptance
*Context: Work*

The Agency's decision that a pull request delivers its Work Item. An explicit approval, a merge with or without review, or no decision ten working days after the pull request opened all count. Acceptance charges the Delivery Fee. A Client's feedback on the Preview Environment is input to it, not Acceptance itself.

**Do not use:** client acceptance, silent approval  
**Not to be confused with** [Review](#review): An assessment of a Result against its Acceptance Conditions; Acceptance is the Agency's decision that follows.  
**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's answer; Evidence for the Agency, never Acceptance.  
**See also:** [Delivery](#delivery), [Delivery Fee](#delivery-fee), [Review](#review), [Acceptance Conditions](#acceptance-conditions), [Agency](#agency)  

## Acceptance Conditions
*Context: Work*

The observable conditions a Result must satisfy to answer the requested work. They depend on the work; software tests alone cannot validate a business case. For a Client's work, the Client's Definition of Done supplies conditions and the Agency's own definition wins where they conflict.

**See also:** [Work Item](../reference/glossary.md#work-item), [Result](#result), [Review](#review), [Acceptance](#acceptance), [Client Profile](#client-profile)  

## Access Role
*Context: Participation*

A named set of permissions a person holds in a Tenant, a Client or a project. The built-in Access Roles are Account owner (billing, budgets, the kill switch and everything an Admin may do), Admin (identity, Teams, sources, secrets and policies, no billing), Lead (start policy, review routing and budgets within the Agency's cap for their projects, accepting learnings), Developer (starts work, reviews and accepts, steers, takes over), Product owner (makes work Ready, prioritises, signs off, never accepts code) and Viewer (reads), plus the Client membership of system ADR-0017. An Agency may compose its own Access Roles from the same permissions. Decided by the owner on VIK-2011; replaces system ADR-0017's viewer, member and admin and the code's admin, operator and viewer; not implemented yet.

**Do not use:** operator, member, pilot  
**Not to be confused with** [Role](../reference/glossary.md#role): Ploeg's specialist function inside a Team, such as builder or reviewer.  
**Not to be confused with** [Operator Consumer](../reference/glossary.md#operator-consumer): A service identity, never a person.  
**See also:** [Tenant](../reference/glossary.md#tenant), [Client](../reference/glossary.md#client), [Agency](#agency)  

## Agency
*Context: Offering*

A business that uses Unfold to build software for its Clients and pays for it. A freelancer, or an in-house team that is its own only Client, is an Agency too. An Agency reviews and merges every pull request and owns production. It uses Unfold hosted, in its own Tenant, or self-hosted. In hosted Unfold its Tenant has its own namespaces, default-deny network, sandboxed runtime and model budget (system ADR-0017; enforcement not implemented yet).

**Do not use:** customer, operator, reseller  
**Not to be confused with** [Tenant](../reference/glossary.md#tenant): The isolated space that holds one Agency's work in hosted Unfold.  
**Not to be confused with** [Client](../reference/glossary.md#client): The Agency's own customer.  
**See also:** [Tenant](../reference/glossary.md#tenant), [Client](../reference/glossary.md#client), [Acceptance](#acceptance)  

## Agent
*Context: Execution*

A software participant that uses a model and tools to perform assigned work through a Harness. A named agent Role does not imply a separate running process.

**See also:** [Harness](../reference/glossary.md#harness), [Role](../reference/glossary.md#role), [Run](../reference/glossary.md#run)  

## AHP
*Context: Tooling · Owner: Unfold*

Agent Host Protocol: Microsoft's JSON-RPC protocol that lets VS Code's Agent Host and other clients share agent sessions. Unfold implements an AHP host for its VS Code extension. Ploeg ADR-0006 keeps AHP out of Ploeg's harness boundary.

**Also known as:** Agent Host Protocol  
**See also:** [Unfold](#unfold), [Harness](../reference/glossary.md#harness)  

## Approver
*Context: Offering · Owner: Unfold*

The party whose approval a Client's proposed Work Items need before a Shift: the Client by default, or, as the Agency sets per Client, the Agency itself or the party in front of the work that pays for it, such as a main contractor. Unfold names that approval to Ploeg under a generic approval name, and Ploeg never learns who the Approver is. Proposed (system ADR-0049); not implemented yet.

**Not to be confused with** [Steward](#steward): The person a Run Card names for its change, picked from the forge's merger or pull request approver.  
**See also:** [Client](../reference/glossary.md#client), [Agency](#agency), [Quote](#quote), [Client Profile](#client-profile)  

## Attempt
*Context: Participation · Owner: Unfold*

Unfold's word on screen for a Shift: one Team's engagement with one Work Item, with the budget held for it, its Rounds and its Runs. Starting a stopped Work Item again opens a new Attempt; the earlier ones stay on its page. Unfold says Shift only where it speaks Ploeg's contract.

**See also:** [Shift](../reference/glossary.md#shift), [Run](../reference/glossary.md#run), [Work Item](../reference/glossary.md#work-item)  

## Attention Path
*Context: Work*

A repository path whose changes need careful review, listed as a glob in .unfold/attention or covered by CODEOWNERS. Agents may change it; a pull request that does is labelled and lists those files first.

**See also:** [Review](#review), [Diff Limit](#diff-limit)  

## Binder
*Context: Cards*

A person's private collection of the Run Cards they hold a copy of. Only its owner sees it, and they may share single cards. There is no manager view of a Binder. Built in Unfold (Unfold ADR 0029, proposed).

**See also:** [Run Card](#run-card), [Roster](#roster), [Pack](#pack)  

## Bounce
*Context: Cards*

A Work Item moving from a later Gate back to an earlier one, with a reason: defect, requirement, misunderstood, environment or unknown. Only defect and unknown Bounces count against the Grade. A requirement Bounce out of acceptance or done marks the card Evolved and leaves no Crack. The reason arrives resolved with each Gate move in Ploeg's delivery facts; a move without one counts as unknown, and a board without Gates has no Bounces (Unfold ADR 0045).

**Examples:** A tester moves the ticket from In test back to In progress with the label bounce:defect, which Ploeg records as the reason; the fix becomes the card's next Play.  
**See also:** [Gate](#gate), [Play](#play), [Grade](#grade), [Crack](#crack)  

## Budget
*Context: Execution*

An authorized spending limit for work. It is separate from a provisional usage estimate and from the eventual reconciled charge. Ploeg holds the budget pool of each Shift. A Budget is named by what it limits: a Shift Budget (set by the Work Item's Size), a Client Budget (per Client per month, set by the Agency) or an Agency Budget (metered usage per month). Its cap is the limit amount, not a separate concept.

**Do not use:** cap (as a noun for a limit)  
**See also:** [Shift](../reference/glossary.md#shift), [Authority](../reference/glossary.md#authority), [Size](#size), [Client](../reference/glossary.md#client), [Agency](#agency)  

## Candidate
*Context: Participation · Owner: Unfold*

The reviewable change Unfold captures from a Session's Workspace when its Team stops: a Git bundle, a binary patch and a manifest, signed when the workbench key is available. It is ready, or unavailable with a reason. Capturing it never publishes or merges anything.

**Not to be confused with** [Delivery Candidate](../reference/glossary.md#delivery-candidate): Ploeg's immutable record of one canonical commit rebuilt from a Candidate on an approved base, used for verification and approval.  
**Not to be confused with** [Result](#result): What a Work Item delivers with its Evidence; a Candidate is one piece of that Evidence.  
**See also:** [Session](#session), [Workspace](#workspace), [Evidence](#evidence), [Review](#review)  

## Client Portal
*Context: Offering · Owner: Unfold*

The part of Unfold where Clients submit Requests, talk to the refinement agent, answer Refinement questions, approve Quotes and give feedback on Preview Environments through signed links. It is the only way Unfold reaches a Client; Unfold never contacts a Client directly. A Client's users see only the Work Items from that Client's sources. It shows the Agency's price; Unfold's own charge is hidden unless the Agency shows it.

**Also known as:** Portal  
**See also:** [Client](../reference/glossary.md#client), [Quote](#quote), [Unfold](#unfold)  

## Client Profile
*Context: Offering*

A Client's Definition of Ready, Definition of Done and extra instructions for agents. It ranks below the delivery contract, like repository instructions. The Definition of Done becomes Acceptance Conditions. Proposed (system ADR-0049): it also holds the Client's Approver and, per repository, the exclusion globs that narrow its Sign-off Paths, and later the Client's default language.

**See also:** [Client](../reference/glossary.md#client), [Ready](#ready), [Acceptance Conditions](#acceptance-conditions), [Refinement](#refinement), [Approver](#approver), [Sign-off Paths](#sign-off-paths)  

## Client Project
*Context: Offering · Owner: Unfold*

A named grouping inside one Client, or inside the Agency's own work, that bundles its tracker sources, its Repository Grants, its Routing Rules, its default Team and its budget: a share of the Client Budget, or of the Agency Budget for the Agency's own work. A Work Item takes its Client and Client Project from its origin. Decided in system ADR-0048; not implemented yet.

**Not to be confused with** [Scope](../reference/glossary.md#scope): A tracker's own container, such as a Vikunja or Jira project.  
**See also:** [Client](../reference/glossary.md#client), [Integration Account](#integration-account), [Repository Grant](#repository-grant), [Work Item](../reference/glossary.md#work-item)  

## Client Sign-off
*Context: Offering · Owner: Unfold*

A Client's answer on one of its Work Item's open pull requests, "looks good" or "needs changes" with a note. It is bound to the pull request's head commit, a new push dismisses it for good, and it covers its Sign-off Paths. It is input to the Agency's Acceptance, never Acceptance itself: it merges nothing, approves nothing in the forge and changes no Ploeg state. Until Client memberships exist, Agency people record it on the Client's behalf. Proposed (system ADR-0049); not implemented yet.

**Do not use:** client acceptance, client verdict, client approval  
**Not to be confused with** [Acceptance](#acceptance): The Agency's decision that a pull request delivers its Work Item; a Client Sign-off is one input to it.  
**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's answer; a Client Sign-off is a person's answer for a Client.  
**See also:** [Sign-off Paths](#sign-off-paths), [Client](../reference/glossary.md#client), [Acceptance](#acceptance), [Preview Environment](#preview-environment), [Client Profile](#client-profile)  

## Crack
*Context: Cards*

A defect confirmed against a Run Card's change. Unfold proposes candidate changes, the fixer names the cause, and a second person who is not the Steward confirms it; the Steward may dispute within five working days. A Crack is never applied automatically, carries a severity from S1 to S4, and is never totalled per person (Unfold ADR 0045).

**See also:** [Mend](#mend), [Steward](#steward), [Grade](#grade), [Bounce](#bounce)  

## Credit
*Context: Billing*

The unit of the Delivery Fee: one Credit pays for one accepted S Work Item. Agencies buy Credits in bundles, and a Credit is always shown with its euro value. Paid Credits never expire while the account is active; promotional Credits can expire and are used first. Tokens and hosting are charged in euros, never in Credits.

**Not to be confused with** [Budget](#budget): An authorized spending limit, not something bought.  
**See also:** [Delivery Fee](#delivery-fee), [Size](#size)  

## Cutover
*Context: Release*

The switch from the old per-application repositories to Unfold for releases and published documentation, including a first live pilot. Documentation publishing has moved to Unfold; release cutover waits for its own Qualification.

**See also:** [Qualification](#qualification)  

## Delivery
*Context: Billing*

A Work Item whose pull request received Acceptance. The Delivery Fee is charged per Delivery. The delivery rate is Deliveries divided by closed Work Items.

**Not to be confused with** [Delivery Candidate](../reference/glossary.md#delivery-candidate): Ploeg's immutable record of one canonical commit prepared for verification.  
**See also:** [Acceptance](#acceptance), [Delivery Fee](#delivery-fee), [Work Item](../reference/glossary.md#work-item)  

## Delivery Fee
*Context: Billing*

The part of a Work Item's price paid in Credits, charged only on Acceptance. A Shift that ends without a Delivery returns its Credits.

**See also:** [Credit](#credit), [Token Charge](#token-charge), [Acceptance](#acceptance), [Delivery](#delivery)  

## Diff Limit
*Context: Work*

The most changed lines and files a Size allows in one pull request, counted without tests, lockfiles and generated files. A Shift that would exceed it stops and proposes a split into Follow-Ups.

**Do not use:** diff budget  
**Examples:** S: at most 150 lines in 5 files.  
**See also:** [Size](#size), [Follow-Up](../reference/glossary.md#follow-up), [Attention Path](#attention-path)  

## Dispute
*Context: Billing*

A disagreement between Unfold and an Agency about a charge, such as a change resembling a closed pull request that landed on the base branch on a weak match. It opens with ten working days' notice before any charge. A Client objecting to a Preview Environment is feedback that the Agency decides against the Acceptance Conditions, not a Dispute.

**Do not use:** preview dispute, client dispute  
**See also:** [Reversal](#reversal), [Acceptance](#acceptance), [Delivery Fee](#delivery-fee)  

## Edition
*Context: Offering*

The plan an Agency is on: Freelancer, Studio, White label or Enterprise. It sets the monthly platform fee and the Credits it includes. Every feature is in the open-source code, so an Edition buys hosting, support or white labelling, never features.

**See also:** [Agency](#agency), [Credit](#credit)  

## Evidence
*Context: Work*

Inspectable material supporting a claim about a Result or a Run, such as cited research, an actual change, or the output of an executed check.

**See also:** [Result](#result), [Review](#review)  

## Finish
*Context: Cards · Owner: Unfold*

The visual layer a Run Card earns by staying live in production: matte, then foil at 7 days, holo at 30, prism at 90, gilded at 180 and infinity at 365. Unfold counts the days from the first production deploy of the latest merged Play, or from the merge when the repository has never reported a production deploy. The deploys come from Ploeg's delivery facts (Ploeg ADR-0047, Unfold ADR 0026).

**See also:** [Run Card](#run-card), [Grade](#grade), [Rarity](#rarity), [Skin](#skin)  

## Gate
*Context: Cards*

A point in a board's workflow that a Work Item passes after review, such as development, test, acceptance and production. Ploeg's delivery facts carry each Gate move already resolved (gateTransitions), and Unfold walks a card's Gate history from them. Unfold's cards.rules setting (boards.<provider:scope>.gates) only places a status move that Ploeg sent without a Gate in the flow figures (Unfold ADR 0045).

**See also:** [Bounce](#bounce), [Run Card](#run-card), [Acceptance](#acceptance)  

## Grade
*Context: Cards*

A Run Card's assessment of its change from 1 to 10 in half steps, from four subgrades: 40 % reliability, 25 % durability, 20 % delivery and 15 % review. The formula is versioned and printed on the card, and a card under 180 days live is capped at 9. It grades the change, never a person. Unfold computes it on read under the current formula (2026.3; every earlier version is kept), lists the inputs it missed, and shows none until a person reviewed a Play or one merged (Unfold ADR 0045).

**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's approve or request_changes answer in one Round. It is one input a Grade could use, not a Grade.  
**See also:** [Run Card](#run-card), [Crack](#crack), [Bounce](#bounce), [Finish](#finish)  

## Intake Source
*Context: Offering · Owner: Unfold*

One configured way for Requests to reach a Tenant, and optionally one Client in it, from a feedback tool, a form or a mailbox: a signed delivery address with its own secret and a mapping template. What it receives is stored as a Request for Refinement; it never becomes a Run, and Unfold never answers the sender. Behind the intake.requests flag.

**Do not use:** inbox, integration  
**Not to be confused with** [Integration Account](#integration-account): An account Unfold uses to read a tracker or forge; an Intake Source is posted to by the sender and holds no account.  
**See also:** [Request](#request), [Client](../reference/glossary.md#client), [Integration Account](#integration-account)  

## Integration Account
*Context: Offering · Owner: Unfold*

One account on one tracker or forge instance, such as one ClickUp workspace token or one GitHub App installation, with its credential reference. It belongs to a Tenant, and any number of sources and repositories use it. It grants nothing on its own, and it is not part of a source's or repository's identity. Not the Settings → Connections page, which checks each board's and repository's wiring. Decided in system ADR-0048; not implemented yet.

**See also:** [Tenant](../reference/glossary.md#tenant), [Client Project](#client-project), [Repository Grant](#repository-grant)  

## Linked Session
*Context: Participation · Owner: Unfold*

An agent session a person runs outside Unfold, such as Claude Code on their own machine, that reports to Unfold through its hooks and is linked to Work Items. Unfold never starts, steers or pays for it; it records the session's state, branch and commits, the Agent Trace of what it wrote, and reads its telemetry.

**Not to be confused with** [Session](#session): Unfold's internal record of a Work Item started in Unfold, shown only as that Work Item.  
**See also:** [Session](#session), [Work Item](../reference/glossary.md#work-item)  

## Markup
*Context: Billing*

The published percentage Unfold adds to token and compute cost when billing an Agency. It is the same for every Agency. The price an Agency charges its Client is the Agency's own and is not a Markup.

**Do not use:** markup tier  
**See also:** [Token Charge](#token-charge), [Agency](#agency)  

## Mend
*Context: Cards*

The confirmed fix of a Crack, drawn as gold seams that stay on the card (kintsugi). A mended card looks more distinguished than an untouched one, while its Grade ends slightly lower. Whoever mends another person's card becomes a co-signer. Built: Unfold records a Mend when the bug's pull request merges and confirms it after 30 days without a new Crack; the gold seams are drawn by the skins (Unfold ADR 0045).

**Also known as:** kintsugi  
**See also:** [Crack](#crack), [Steward](#steward), [Grade](#grade)  

## Model Provider
*Context: Execution*

The service that runs a model and answers inference requests. A provider can run outside the cluster that hosts an agent's files and tools.

**Examples:** Fireworks.ai; DeepSeek  
**See also:** [Harness](../reference/glossary.md#harness)  

## Needs-you Reason
*Context: Participation · Owner: Unfold*

Why a Work Item waits on a person, with its fix. Unfold reads it from Ploeg's state (needs_human or stale) and the Shift's close reason, and shows a short chip, a sentence that explains it, what to change and how to start again: assign the task to the Team again in its tracker. Needs you groups Work Items by it. A reason code Unfold does not know is named as unrecognised, never hidden (apps/unfold/public/core/reasons.js; Unfold ADR 0024, proposed).

**Do not use:** needs attention  
**Not to be confused with** [Verdict](../reference/glossary.md#verdict): An agent reviewer's answer; a Needs-you Reason is why a person must act.  
**Examples:** Checks did not pass: the Team's checks failed on the pushed commit and no fix Round could run.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Shift](../reference/glossary.md#shift), [Stage](#stage)  

## OpenSpec
*Context: Tooling · Owner: Ploeg*

A spec-driven change workflow and CLI. Ploeg keeps its change proposals and specs under apps/ploeg/openspec; mise.toml pins the CLI. A Work Item can name a change with a description line "openspec: <change-id>"; its Run is then briefed from the change and handed off for review only when strict validation of the change passes.


## Pack
*Context: Cards*

The once-per-sprint ceremony that hands a person the Run Cards they earned that sprint. Opening it may add one cosmetic variant to a card, such as a foil pattern, alternative art, full art or a gold signature, drawn from published odds with a recorded seed. A Pack cannot be bought, re-rolled or traded, and a pull never changes a Grade, a Rarity or any metric. Built in Unfold (Unfold ADR 0029, proposed): a Pack covers an ISO week unless a Team sets its own sprint length and start.

**See also:** [Binder](#binder), [Rarity](#rarity), [Grade](#grade)  

## Placement
*Context: Participation · Owner: Unfold*

Where a Session's Workspace runs, chosen per Session from the backends a deployment enables: a container on the workbench host (docker), a pod in the cluster (kubernetes) or a working directory shared with the server (local). Omitted, it takes the deployment default. A demonstration lists no placements.

**See also:** [Session](#session), [Workspace](#workspace)  

## Play
*Context: Cards · Owner: Unfold*

One pull request of a Work Item as its Run Card shows it, oldest first. A pull request closed after a Bounce and its merged successor are two Plays on one card. Cost and lines are summed across Plays, and each Play's Runs appear as the Roles that ran (Unfold ADR 0045).

**See also:** [Run Card](#run-card), [Bounce](#bounce), [Shift](../reference/glossary.md#shift)  

## Ploeg
*Context: System · Owner: Ploeg*

Unfold's execution engine and its only Authority. It takes work from trackers and from Unfold, admits it, sets its budget, controls who may write each branch and runs the agents. Dutch for a team that works a shift.

**See also:** [Unfold](#unfold), [Admission](../reference/glossary.md#admission), [Authority](../reference/glossary.md#authority), [Run](../reference/glossary.md#run), [Shift](../reference/glossary.md#shift)  

## Preview Environment
*Context: Work*

A running copy of one pull request's change, deployed with generated test data by a CI step in the Agency's own pipeline, to the Agency's infrastructure or to Unfold's preview hosting in the Agency's Tenant. Its address is posted to the pull request and the Client Portal. It is deleted when the pull request merges or closes, or after an idle limit, and never receives production secrets.

**Also known as:** Preview  
**Do not use:** staging, review app  
**See also:** [Acceptance](#acceptance), [Client Portal](#client-portal), [Tenant](../reference/glossary.md#tenant)  

## Qualification
*Context: Release*

Recorded, repeatable proof that a component or path works as required before anyone relies on it. For example, `mise run integration` qualifies the execution paths with a deterministic fixture, no model calls and no spend. A qualification record states what it did not cover.

**See also:** [Cutover](#cutover)  

## Quote
*Context: Billing*

A Work Item's Size and the Agency's price for it, drafted by Refinement and approved by the Client or by the Agency on its behalf. A Work Item with a Client waits as proposed until its Quote is approved.

**See also:** [Size](#size), [Refinement](#refinement), [Client](../reference/glossary.md#client), [Ticket](#ticket)  

## Rarity
*Context: Cards*

How exceptional a Run Card's change was, its challenge, kept apart from how well it was done (Grade) and how long it has lasted (Finish). Cosmetic only, and off by default (owner decision 2026-10-17): it shows when cards.rules.rarity is true, or, while that setting is unset, to a person whose cards.rarity feature flag is on. Unfold scores reach, sensitive ground, novelty and damped size under a versioned formula, predicts a tier at mint and reveals one at release, as percentile tiers per repository and quarter (common, uncommon, rare, epic, legendary), and freezes the revealed tier in its card store (system ADR-0030), also while rarity is hidden, so turning it on shows the frozen tiers (Unfold ADR 0045). Nothing Ploeg authorizes, budgets or merges depends on it.

**See also:** [Run Card](#run-card), [Grade](#grade), [Finish](#finish), [Pack](#pack)  

## Ready
*Context: Work*

A Work Item is ready when it states something we have decided to do, or describes a problem in enough detail that a solution can be formulated or at least conceived. Ready work can be given to agents. Work that is not ready can itself be given to agents whose job is to make it ready. A Client's Definition of Ready adds conditions for that Client's work; it never removes this baseline.

**See also:** [Work Item](../reference/glossary.md#work-item), [Acceptance Conditions](#acceptance-conditions), [Follow-Up](../reference/glossary.md#follow-up), [Client Profile](#client-profile), [Refinement](#refinement)  

## Refinement
*Context: Work*

Turning a Request into one or more Ready Work Items, each with Acceptance Conditions and a proposed Size. A refinement Role does it, asks for missing information through the Agency, and cannot dispatch the Work Item. Its Ready Check tells the Agency, before any Shift spend, whether the Work Item is ready for agents. Sold on its own, it is request-to-quote.

**Also known as:** request-to-quote  
**See also:** [Request](#request), [Ready](#ready), [Quote](#quote), [Size](#size), [Client Profile](#client-profile)  

## Repository Grant
*Context: Offering · Owner: Unfold*

Permission for a Client Project to route work to a repository its Tenant owns. Several Client Projects may hold a grant on one repository, such as a shared library; each Client still sees only its own Work Items on it. Decided in system ADR-0048; not implemented yet.

**See also:** [Client Project](#client-project), [Client](../reference/glossary.md#client), [Work Target](../reference/glossary.md#work-target)  

## Request
*Context: Offering*

A Client's ask and the conversation about it, received through the Client Portal, a tracker or email. Refinement turns one Request into one or more Work Items, each with its own Quote. A Request is never dispatched; only its Work Items are.

**Do not use:** client ticket  
**Not to be confused with** [Work Item](../reference/glossary.md#work-item): The unit of work Ploeg runs Shifts against; a Request becomes one or more of them.  
**See also:** [Client](../reference/glossary.md#client), [Refinement](#refinement), [Quote](#quote), [Client Portal](#client-portal), [Intake Source](#intake-source)  

## Result
*Context: Work*

What a Work Item delivers, together with the evidence needed to judge it. It can be a code change, a research conclusion, a design or another requested deliverable.

**Not to be confused with** [Outcome](../reference/glossary.md#outcome): Ploeg's terminal code for one Run, such as pr_opened or stuck.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Evidence](#evidence), [Review](#review)  

## Reversal
*Context: Billing*

The refund of a Delivery Fee when an accepted change is reverted within 14 days for a defect inside its Acceptance Conditions.

**Do not use:** chargeback  
**See also:** [Delivery Fee](#delivery-fee), [Acceptance](#acceptance), [Dispute](#dispute)  

## Review
*Context: Work*

An assessment of a Result against its Acceptance Conditions and supporting Evidence. For a Work Item that changes code it is a person's review of the pull request, wherever the Work Item came from. A favorable assessment is distinct from releasing software to production.

**Not to be confused with** [Verdict](../reference/glossary.md#verdict): A reviewing Run's approve or request_changes answer. It is Evidence for a Review, not acceptance.  
**See also:** [Result](#result), [Acceptance Conditions](#acceptance-conditions), [Evidence](#evidence), [Verdict](../reference/glossary.md#verdict)  

## Roster
*Context: Cards*

The humans who acted on a Run Card's change, each with their roles. Built roles: merger, reviewer, qa (moved the Work Item out of the test Gate), acceptor (out of acceptance) and cosigner (mended a Crack on someone else's card). Proposed: developer and PO copies, each holding a copy of the card that shares its fate, so a Crack shows on every copy and a Mend names the mender on every copy. The built roles are recorded in Unfold ADR 0045.

**See also:** [Run Card](#run-card), [Steward](#steward), [Binder](#binder)  

## Run Card
*Context: Cards*

The record of one Work Item's change and its life in production: who carried it, what its Runs cost, its Plays, review, CI and deployments, its Grade, Rarity, Cracks and Mends. Unfold assembles it on read from Ploeg's delivery facts and its own card store, and draws it (system ADR-0030, Unfold ADR 0026). It describes a change, never a person, and its state never changes what Ploeg authorizes, budgets or merges.

**Also known as:** card  
**Not to be confused with** [Run](../reference/glossary.md#run): One Role executing against a Work Item. A Run Card covers every Run of its Work Item, across all its Shifts.  
**Examples:** Work Item 138 has one Run Card with two Plays: #57, closed after a test Bounce, and #61, merged.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Play](#play), [Steward](#steward), [Roster](#roster), [Finish](#finish), [Grade](#grade), [Rarity](#rarity), [Skin](#skin)  

## Session
*Context: Participation · Owner: Unfold*

Unfold's internal record of a Work Item a person started in Unfold: its brief, the person's instructions, their answers to the agents' questions and permission requests, and the Candidate its Workspace produced. One Session belongs to one Work Item and spans all of that Work Item's Attempts and Runs. People never meet it as a thing of its own: it shows on its Work Item's page, whose origin reads "Started in Unfold".

**Not to be confused with** [Shift](../reference/glossary.md#shift): Ploeg's whole attempt on a Work Item, which Unfold calls an Attempt; Ploeg avoids "session" for it.  
**Not to be confused with** [Linked Session](#linked-session): An agent session a person runs outside Unfold; the only thing Unfold's screens call a session.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Attempt](#attempt), [Team](../reference/glossary.md#team)  

## Set Card
*Context: Cards*

The Run Card of an epic Work Item, whose children are Run Cards numbered within the set, read from the tracker parents in Ploeg's delivery facts. A set completes when every child has been live for 30 days with no unmended Crack, and its epic's card then shows as legendary (Unfold ADR 0045).

**See also:** [Run Card](#run-card), [Work Item](../reference/glossary.md#work-item), [Crack](#crack)  

## Sign-off Paths
*Context: Offering · Owner: Unfold*

The changed paths a Client Sign-off covers: every path its pull request changes at the signed head, minus those matching the exclusion globs the Agency set for that Client and repository in the Client Profile. A file in the repository may propose more exclusions; the Client Profile wins where they disagree. Each Client Sign-off stores its own, and a truncated or missing path list never counts as the whole change. Proposed (system ADR-0049); not implemented yet.

**See also:** [Client Sign-off](#client-sign-off), [Client Profile](#client-profile), [Attention Path](#attention-path)  

## Size
*Context: Billing*

The class S, M or L that Refinement proposes for a Work Item and the Client approves in its Quote. A Size sets the Delivery Fee in Credits, the Shift Budget and the Diff Limit. There is no larger Size; Refinement splits work estimated above L.

**Examples:** S: 1 Credit, a €4 Shift Budget, at most 150 changed lines in 5 files (system ADR-0006). Ploeg holds a Shift's budget pool in US dollars; how a euro Shift Budget becomes that pool is not decided yet.  
**See also:** [Quote](#quote), [Credit](#credit), [Budget](#budget), [Diff Limit](#diff-limit)  

## Skin
*Context: Cards · Owner: Unfold*

The look a Run Card is drawn in, chosen per repository in Unfold's cards.rules setting (repositories.<owner/name>.style), which replaced Ploeg's retired cardStyle key. A Skin changes appearance and motion, never the facts or where they sit. Built: Unfold Native, the 3D forge Skin, and Holo Rarity, Loot Drop, Arcade Cabinet, Ticker Terminal and Mission Patch. Proposed: per-Client themes on top.

**See also:** [Run Card](#run-card), [Work Target](../reference/glossary.md#work-target), [Finish](#finish)  

## Stage
*Context: Participation · Owner: Unfold*

One of the four phases Unfold shows a Work Item passing on its page, in order: Define, Execute, Review and Deliver. Unfold derives the current Stage from Ploeg's state and the Run Card alone, and names why a stopped Stage halted (needs a person, stale or withdrawn). Deliver is skipped for work that ended without a merged pull request, and is never shown done without a reported deploy (Unfold ADR 0038; apps/unfold/public/core/stages.js).

**Not to be confused with** [Gate](#gate): A tracker status group after review, such as test or acceptance, that a Run Card counts Bounces between.  
**Not to be confused with** [Review](#review): The assessment of a Result. The Review Stage is the time a pull request waits for it.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Review](#review), [Run Card](#run-card)  

## Step
*Context: Participation · Owner: Unfold*

A part of one Run that Unfold performs internally, such as one Team Role in a delegated Run. A Step is not a separate Ploeg Run and has no Lease or budget of its own.

**Do not use:** role run  
**Not to be confused with** [Run](../reference/glossary.md#run): One Role executing against a Work Item, authorized by Ploeg.  
**See also:** [Run](../reference/glossary.md#run), [Team](../reference/glossary.md#team), [Unfold](#unfold)  

## Steward
*Context: Cards*

The person a Run Card names as answering for its change while it runs, with first right to mend it. Built today: whoever merged the latest merged Play, otherwise the last approver; forge bot logins never count. Proposed: the developer carrying the Work Item, meaning the tracker assignee at release, falling back to the merger and then the approver. The agent is never a Steward. A Steward is a role on a change, not a measure of a person. The built rule is recorded in Unfold ADR 0045.

**Do not use:** owner (of a card)  
**See also:** [Run Card](#run-card), [Roster](#roster), [Crack](#crack), [Mend](#mend)  

## Supervision
*Context: Participation · Owner: Unfold*

Whether a person is watching a Ploeg-authorized Session live (human) or has handed it back to run on its own (background). Switching it changes only who is paying attention; the same execution keeps running and no new Run starts. Demo Sessions have no supervision setting.

**See also:** [Session](#session), [Run](../reference/glossary.md#run), [Authority](../reference/glossary.md#authority)  

## TechDocs
*Context: Tooling*

Backstage's documentation format: a static site built from Markdown by MkDocs with the techdocs-core plugin. `mise run docs-check` builds Unfold's TechDocs output in strict mode.

**See also:** [Zensical](#zensical)  

## Ticket
*Context: Offering*

The word Agencies and Clients use for a Work Item with a Quote. Use it only in the Client Portal, sales material and price lists. Everywhere else, including code and these docs, say Work Item: the unit of work is the Work Item, whatever its source.

**See also:** [Work Item](../reference/glossary.md#work-item), [Quote](#quote), [Tracker Item](../reference/glossary.md#tracker-item)  

## Token Charge
*Context: Billing*

The part of a Work Item's price charged for every attempt: model tokens and compute at cost plus the Agency's Markup, up to the Shift Budget. Rejected work still pays it; attempts that fail through Unfold's own fault do not.

**See also:** [Delivery Fee](#delivery-fee), [Markup](#markup), [Budget](#budget)  

## Unfold
*Context: System · Owner: Unfold*

The product, its application and the monorepo that holds them. In the Unfold application, in the browser and the VS Code extension, people define work, follow it, steer agents and review evidence; Ploeg, a released dependency the monorepo pins, admits and runs every Run. Without Ploeg the application runs only a deterministic demo that makes no model calls.

**Examples:** Current state: Unfold's own engine still executes delegated Steps until the system ADR-0002 migration is complete.  
**See also:** [Ploeg](#ploeg), [Session](#session), [Step](#step)  

## Unfold Chat
*Context: Participation · Owner: Unfold*

A conversation one person has with Unfold itself in the Agents window, under the agent named Unfold beside Unfold teams. Each message is one Chat that Ploeg admits against a Team's Chat Allowance, answered with that Team's Ask model, which may read Unfold through its MCP tools and act only after the person confirms each change. Unfold keeps the conversation; no Team reads it. Proposed (Unfold ADR 0049).

**Not to be confused with** [Session](#session): Starting a Work Item in Unfold submits work to a Team; an Unfold Chat starts Team work only through a confirmed hand-off.  
**Not to be confused with** [Ask](../reference/glossary.md#ask): An Ask is one question about one Work Item, paid from the Ask Allowance.  
**See also:** [Chat](../reference/glossary.md#chat), [Session](#session), [Ask](../reference/glossary.md#ask), [Team](../reference/glossary.md#team)  

## User Journey
*Context: Participation*

One person's path from a trigger to an outcome they care about, across every tool they touch, such as deciding on an agent pull request. The ten User Journeys Unfold must support are ranked on the users-and-journeys concept page; every screen serves one of them.

**Do not use:** flow, journey (for a Work Item's path through Ploeg)  
**Not to be confused with** [Work Item](../reference/glossary.md#work-item): The paths a Work Item takes through Ploeg are the system journeys page, not User Journeys.  
**See also:** [Access Role](#access-role), [Agency](#agency)  

## Walkthrough
*Context: Work*

The steps a writing Run reports for a person to check its change without reading code: each says what to do and what they should see, with a screenshot the agent took while walking the same step. When the change shows nowhere, the Walkthrough says so in plain words instead. Proposed in ploeg-hq pull request 185 and Unfold ADR 0054; not implemented yet.

**Not to be confused with** [Evidence](#evidence): What a Review rests on, such as the diff and CI. A Walkthrough is the agent's own account and helps a person check; it proves nothing alone.  
**See also:** [Review](#review), [Result](#result), [Evidence](#evidence)  

## Work Item Brief
*Context: Participation*

The Client-safe projection of a Work Item that an Ask answers from. It never holds prompts, tool input or output, transcripts, diffs, gateway details, operator notes or another Work Item's facts. Built in Unfold (apps/unfold/src/ask/brief.ts) from an allow-list: title, objective, state and why it stopped, pull request and preview status, its Runs with their summaries and Verdicts, progress, and spend in US dollars. It does has no Acceptance Conditions field yet. Decided in system ADR-0031, which is still proposed.

**See also:** [Ask](../reference/glossary.md#ask), [Client](../reference/glossary.md#client)  

## Work Item Link
*Context: Work · Owner: Unfold*

A confirmed "same work as" between a Work Item and another tracker item or forge issue of the same Client, or of the Agency's own sources. A reference in an item only proposes one; a person with access to both confirms it. Assigning a linked item to a Team creates no second Work Item. It maps to a Ploeg contract still to be named upstream. Decided in system ADR-0048; not implemented yet.

**Not to be confused with** [Linked Session](#linked-session): An agent session run outside Unfold that reports to a Work Item.  
**See also:** [Work Item](../reference/glossary.md#work-item), [Tracker Item](../reference/glossary.md#tracker-item)  

## Workbench
*Context: System · Owner: Unfold*

One running deployment of the Unfold application: its server, its configuration, credentials and storage, and the host or namespace it runs on. People sign in to a workbench, link accounts to it and connect the VS Code extension to it; its Sessions and connections belong to it. The workbench host runs its docker and local Placements, and the workbench key signs its Candidates. Ploeg does not use the word.

**Not to be confused with** [Workspace](#workspace): The files and tools of one Run or Session; a workbench runs many.  
**Not to be confused with** [Unfold](#unfold): The product and its application; a workbench is one deployment of it.  
**Examples:** No Ploeg connection is configured for this workbench.  
**See also:** [Unfold](#unfold), [Session](#session), [Placement](#placement), [Candidate](#candidate)  

## Workspace
*Context: Execution*

The working environment containing the files and tools available to a Run. Its contents are separate from the ticket and from the decision to accept a Result.

**See also:** [Run](../reference/glossary.md#run), [Harness](../reference/glossary.md#harness), [Evidence](#evidence)  

## Zensical
*Context: Tooling*

The static site generator that renders Unfold's published human pages from the same mkdocs.yml and Markdown sources. The builder image pins its version.

**See also:** [TechDocs](#techdocs)  

---

## Retired terms

Do not use these names as terms.

### Vloer
*Use instead: [Unfold](#unfold)*

The front end was named Vloer while Ploeg and it were separate products. Once Unfold became the product and the application people use, a second name for the same application only added a part people had to learn (system ADR-0020).

### Workload
*Use instead: [Work Item](../reference/glossary.md#work-item)*

A second name for the unit of work made every rule ambiguous about which record it meant.

### Repair Subticket
*Use instead: [Follow-Up](../reference/glossary.md#follow-up)*

A repair is work created by work; Ploeg's Follow-Up already names it.

### Crew
*Use instead: [Team](../reference/glossary.md#team)*

One concept gets one word, and Ploeg's Team already names the Roles that work a Work Item, so a second word makes a screen or a page read as two concepts (system ADR-0036).

### Agency Edition
*Use instead: [Edition](#edition)*

Agency names the business that uses Unfold, so "the Agency edition" would mean two things in one sentence. The middle Edition is Studio.

## Terms owned by other models

This model uses these terms with their owners' meaning: [Admission](../reference/glossary.md#admission), [Ask](../reference/glossary.md#ask), [Authority](../reference/glossary.md#authority), [Chat](../reference/glossary.md#chat), [Client](../reference/glossary.md#client), [Follow-Up](../reference/glossary.md#follow-up), [Harness](../reference/glossary.md#harness), [Lease](../reference/glossary.md#lease), [Outcome](../reference/glossary.md#outcome), [Role](../reference/glossary.md#role), [Run](../reference/glossary.md#run), [Shift](../reference/glossary.md#shift), [Team](../reference/glossary.md#team), [Tenant](../reference/glossary.md#tenant), [Tracker Item](../reference/glossary.md#tracker-item), [Verdict](../reference/glossary.md#verdict), [Work Item](../reference/glossary.md#work-item), [Work Target](../reference/glossary.md#work-target).

## Decisions cited

- [system ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md): Ploeg is the only execution engine and Unfold is its front end.
- [system ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md): Unfold is offered to agencies; delivery ends at a reviewed pull request with a preview.
- [system ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md): A Work Item with a Quote is the billing unit; the Delivery Fee is charged on Acceptance.

---

## Example dialogues

Short exchanges showing the terms used precisely at concept boundaries.

### Research can stop implementation
*Context: Work*

> **Developer:** Does this research Work Item require a prototype?
> **Product owner:** The Evidence establishes that we should not build. The Result is the supported conclusion to stop.
> **Developer:** Then Review should judge that Evidence against the Acceptance Conditions.

### What a model can do
*Context: Execution*

> **Developer:** Does changing the Model move the files to a new computer?
> **Platform engineer:** No. The Workspace holds the files. The Harness sends input to the Model Provider and runs permitted tools.
> **Developer:** So Model, Harness, and Workspace are separate choices for a Run.

### Run, Step and Shift
*Context: Participation*

> **Developer:** My Unfold session ran a planner, an implementer and a reviewer. Is that three Runs?
> **Platform engineer:** Today it is one delegated Run with three Steps inside the Unfold application. After the system ADR-0002 migration each Role executes as its own Ploeg Run.
> **Developer:** And the whole attempt, with its branch and budget?
> **Platform engineer:** That is the Shift. Only the writing Run holds the Lease on its branch.

### Acceptance, Review and the Client
*Context: Billing*

> **Agency developer:** The Client liked the **Preview Environment**. Is the Work Item accepted now?
> **Product owner:** No. The Client's feedback is input. **Acceptance** is our decision on the pull request, by approving it or merging it.
> **Agency developer:** And the reviewer Role's approve Verdict?
> **Product owner:** That is Evidence for our **Review**. Only our Acceptance makes it a **Delivery** and charges the **Delivery Fee**.

---

## ⚠ Flagged ambiguities

### a CI failure with no original ticket

Repair subtickets require a parent, but a human-written change may not already have an external ticket.

**Options:** Create a parent work ticket linked to the change, Attach repair to a project incident ticket  
**Recommendation:** Preserve a direct link to the failed change and agree the external parent-ticket rule.  

### limits on automatic repair

Repeated CI failures could create duplicate subtickets or consume an unbounded amount of work.

**Options:** One active repair subticket per failure with bounded attempts, A new subticket per failed check run  
**Recommendation:** Reuse an active repair subticket for the same failure and stop at agreed limits.  

### agents create and execute follow-up work

Creating a proposed ticket and authorizing its execution grant different powers.

**Options:** Agents propose and people authorize, Explicit project rules authorize bounded follow-up work  
**Recommendation:** Separate permission to propose from permission to spend and execute. Ploeg's Admission grants the second.  

### which decision records are required

Visibility into decisions needs a defined record beyond raw model messages and tool logs.

**Options:** Written decision with options and evidence, Transcript and actions alone  
**Recommendation:** Capture the decision, responsible person or rule, evidence, and expected consequence.  

### a Request that arrives through a tracker

Ploeg mirrors every assigned Tracker Item into a Work Item. A Client's ask that arrives as a ClickUp or Vikunja task is a Request, not yet a Work Item, so either the mirror must wait for Refinement or the Request must live in Unfold beside the Tracker Item.

**Options:** The tracker task is the Request; Refinement's Work Items become new Tracker Items or stay in Ploeg (Ploeg ADR-0031), Ploeg mirrors it as an unready Work Item that Refinement replaces with the real ones, Requests only come through the Client Portal; tracker tasks are always Work Items  
**Recommendation:** The tracker task is the Request. Refinement's Work Items stay in Ploeg as proposed until their Quotes are approved, which reuses Ploeg ADR-0031 and keeps the Agency's tracker as the one place its Clients' asks live.  

### the period a Pack covers

A Pack was proposed once per sprint, but Unfold had no sprint concept and some teams do not work in sprints.

**Options:** The tracker's iteration or cycle, where it has one, A fixed calendar period for every team, A period each Team sets in Ploeg's configuration  
**Recommendation:** Built in Unfold as an ISO week by default, with a Team's own sprint length and start date instead (Unfold ADR 0029, proposed). The ambiguity closes when that ADR is decided.  

## Resolved ambiguities

- **a Tenant and a Team** — A Tenant sits above Teams, each Team belongs to one Tenant, and a self-hosted install has a default Tenant (system ADR-0017, accepted). Unfold imports the Tenant term from Ploeg's model; enforcement in Ploeg and Unfold is not implemented yet.
