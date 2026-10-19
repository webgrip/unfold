---
type: explanation
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-10-14
verified_by: "Round-1 owner answers of 2026-10-11 (recorded on VIK-2008) and the owner decisions of 2026-10-14 on Access Role names, Try again and spent budgets (VIK-2011, VIK-2019); read against docs/adr 0005-0011, 0017, 0021, 0022, 0026, 0031, apps/unfold/docs/adrs 0023-0025, 0038, 0040, Ploeg ADRs 0012, 0044, 0066 at the pinned aad61107, and apps/unfold/src at origin/development 42c6a041. Today's status per stage comes from a source read; nothing was run. No user research has been done: every role and journey is the owner's decision or a hypothesis marked as one."
---

# Users and their journeys

Who uses Unfold, what each of them needs, and the ten journeys the product must support well. A **journey** here is one person's path from a trigger to an outcome they care about, across every tool they touch. The technical paths a Work Item takes through Ploeg are on [Journeys](journeys.md); this page is about people.

Every screen is judged against the owner's sentence for the primary user:

> I was able to move much more development work than I would have normally, and frictionless. I felt like I found what I needed easily to make the decisions I had to. I didn't feel held back or annoyed. I was able to put my attention to where it mattered.

**Status.** The roles, round-1 answers and the order of the journeys are the owner's decisions of 2026-10-11. Round 2 (the enterprise layer) is open in [VIK-2009](https://vikunja.webgrip.dev/tasks/2009); where a journey depends on it, the text says *open*. Where it says *hypothesis*, nobody has checked it with users.

## Who buys and who uses

An **Agency** buys Unfold and pays for it; its **Client** pays the agency ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md), [Who Unfold is for](who-unfold-is-for.md)). The owner named the agency owner as the primary user, "and therefore the developer. Dogfooding is the best way." Read as: the agency owner is judged on outcomes and cost, the developer is the daily user whose friction decides those outcomes. *Open: confirm this reading (R1).*

## The cast

| Role | Class | Does with Unfold | Mostly works in |
|---|---|---|---|
| Freelancer or solo developer | core | everything: hands work over, reviews, accepts, watches cost | Unfold, forge, tracker |
| Tech lead or team lead | core | decides what agents take and which Team, reviews, unblocks, watches flow | Unfold, forge |
| Senior or medior developer | core | reviews and accepts agent pull requests, takes over stuck work, hands over chores | forge, VS Code, Unfold |
| Junior developer | secondary | hands over and reviews within granular permissions | VS Code, forge, Unfold |
| Product owner | secondary | makes work Ready, follows it, signs off, works in Unfold behind SSO and granular roles | Unfold, tracker |
| QA or tester | secondary | checks a change on its preview against the acceptance conditions | preview, tracker |
| Agency owner, CTO | secondary (buyer) | sets budgets and policy, reads cost per accepted change, holds the kill switch | Unfold Insights |
| Platform engineer, admin | secondary | identity, Teams, sources, secrets, health | configuration, Status |
| Scrum master | edge | flow numbers | Insights |
| Account manager | edge | turns client asks into quotes | Client Portal, mail |
| Auditor, finance | edge (*hypothesis*: not classified by the owner yet) | asks who did what and what it cost; exports | exports |
| Client | outside the workbench | requests, approves quotes, tries previews | Client Portal (not built) |

Juniors get full access "but RBAC etc granular"; product owners make Unfold their main place, "RBAC etc through SSO in proper ways"; any developer may hand work over. Unfold therefore needs permissions finer than today's three roles.

**Access Roles.** The owner decided the built-in [Access Roles](../reference/glossary.md#access-role) on [VIK-2011](https://vikunja.webgrip.dev/tasks/2011); the permission table per role is that ticket's work, and nothing is built yet.

| Access Role | May | Typical holder from the cast |
|---|---|---|
| Account owner | billing, budgets, the kill switch, everything an Admin may do | agency owner |
| Admin | identity, Teams, sources, secrets, policies; no billing | platform engineer |
| Lead | start policy, review routing and budgets within the agency cap for their projects; accept learnings | tech lead |
| Developer | start work, review and accept, steer, take over | freelancer, senior, medior and junior developers (a junior with a narrower scope) |
| Product owner | make work Ready, prioritise, sign off; never accept code | product owner, QA |
| Viewer | read | scrum master, account manager |
| Client | its own Client's work only ([ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)) | the agency's client |

They replace ADR-0017's `viewer`, `member`, `admin` and the code's `admin`, `operator`, `viewer`: admin becomes Admin, operator and member become Developer, viewer stays Viewer. Each Tenant names its Account owner explicitly. *Operator* stays a word for service identities and *pilot* for the hosted trial.

## What the core users need

**Tech lead or freelancer, the one who hands work over**

- When I open Unfold, I want to see in one look what needs me and what is moving, so I can decide what to do first.
- When work is Ready, I want it to start in one move or by itself within limits I set, so starting work costs no attention.
- When I hand work over, I want to see the terms (size, budget cap, Team, reviewer) and that it left my hands, so I trust it is moving.
- In the owner's words: "manage their time efficiently, have agents pick up work they want to be responsible for understanding and solving". *Open: which way this reads (R2).*

**Reviewer**

- When an agent pull request is ready, I want what changed, why, what the agent reviewer found and the fixing agent changed, and what was learned, so I can accept or send it back quickly. In the owner's words: "Clear review on the PR by agent that was already also fixed by another agent, Learnings from that enter the summary for the human reviewer."
- When I ask for changes, I want the agents to pick them up on the same branch, so I do not explain twice.
- When an agent got stuck, I want to take over in my editor with its context, so I do not start from scratch.

**Agency owner**

- At the end of the month, I want spend per accepted change, rework and review load, so I know whether working without hourly billing pays off.

## The ten journeys

Ranked by how often they happen times how much they decide trust, adoption or revenue; the owner put the review first. Each journey lists what is already decided, so a design never re-opens it.

### 1. Decide on an agent pull request

| | |
|---|---|
| Actors | reviewer (responsible), the person who handed it over (informed), agency owner (informed of acceptance) |
| Starts when | a pull request waits for review and is routed to me |
| Done when | accepted, sent back with changes requested, or taken over, with my name on it |
| How often | several times a day per developer |
| Decided | Acceptance is an approval, a merge, or no decision 10 working days after the PR opened; reminders on day 3 and 7; closing without merging takes a one-click reason ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)). An agent verdict is evidence, never acceptance. Unfold never merges. Every PR names the reviewing developer ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md)). PRs stay within the size limits of [ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md). |
| Enterprise | permission to accept per project; four-eyes and routing policies (*open*, [VIK-2012](https://vikunja.webgrip.dev/tasks/2012)); acceptance is an audit and billing event |
| States | first review · after changes requested · merge conflict · failed checks · no permission to accept · not routed to me · day-10 silent acceptance coming |
| Success measure | time from ready to decision (median, per week) and share accepted without a fix Round; baseline: not instrumented yet |

| Stage | Where | Today |
|---|---|---|
| Notice | Now, notification | partly: browser notifications only while a tab is open |
| Understand | Work Item page | partly: problem and solution and the agent verdict; no combined summary of review, fixes and learnings |
| Judge | forge, Work Item page, preview | partly: a "Before you merge" checklist; no diff in Unfold; previews not built |
| Decide | forge | partly: approve and request changes happen on the forge; take over via a checkout link |
| Rework or merge | Ploeg | works: requested changes start a new Shift; a merge moves the item to done |

### 2. See what needs me

| | |
|---|---|
| Actors | every workbench user, filtered to their role and scope |
| Starts when | opening Unfold, or a notification |
| Done when | I know the one to three things that need me and nothing else asks for attention |
| How often | several times a day |
| Decided | Unfold opens on Now (Ready for your review, Needs you, Proposed); the server notifies per state change that needs a person, over ntfy then Web Push ([ADR-0026](../adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md), proposed); agencies are notified by email ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)) |
| Enterprise | only what my Tenant, Client and role may see ([ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)); channels per organisation (*open*, R9) |
| States | nothing waits · more than 20 wait · no Team access · Ploeg unreachable · several Tenants |
| Success measure | time from "needs you" to first action; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Arrive | Now | works: waiting, in flight, refused, recent |
| What is mine | Now | missing: no "mine"; Work Items have no person assigned or routed |
| Get told | notification, mail | partly: browser only; no server notifications or mail |
| Act | Work Item page | partly: see journeys 1 and 4 |

### 3. Get work started

Two entry points with one outcome: a person hands work over, or Ready work starts by itself within a policy (owner Q6: "Yes, within budget and review room").

| | |
|---|---|
| Actors | any developer with the permission (manual); the policy set by a lead or owner (automatic); the reviewer (informed) |
| Starts when | a Ready item someone wants agents to do, or a Ready item and room in budget and review |
| Done when | it is moving with a Team, a budget and a reviewer, visible to whoever handed it over |
| How often | daily |
| Decided | assignment in the tracker starts tracker work and unassignment withdraws it; Unfold hands off by assigning the Team's tracker user ([Unfold ADR-0025](../../apps/unfold/docs/adrs/0025-hand-tracker-tasks-to-ploeg-by-assignment.md)); Unfold submits work to Ploeg and never executes it ([Unfold ADR-0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)); no account or Work Item without a hard budget |
| Enterprise | permission to start work per project and budget limit per role (*open*, [VIK-2011](https://vikunja.webgrip.dev/tasks/2011)); every start, manual or automatic, records who or which policy version ([VIK-2014](https://vikunja.webgrip.dev/tasks/2014)) |
| States | not Ready · no permission · budget reached · review room full · route refused · taken back |
| Success measure | time from Ready to started; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Pick | Tasks, tracker | works: Tasks lists the backlog |
| Check readiness | Tasks | missing |
| See the terms | Tasks | missing: size, cap and reviewer are not shown before the hand-off |
| Hand over | Tasks | works: one Team, refuses when another holds it; [PR #326](https://forgejo.webgrip.dev/webgrip/unfold/pulls/326) adds team pills, `h` and a live track |
| Start by policy | Ploeg | missing: only Run-created follow-ups can start themselves |
| See it move | Tasks, Now | partly: In flight on Now in PR #326 |

### 4. Steer and unstick work in flight

| | |
|---|---|
| Actors | the person routed to it (responsible), a lead when escalated |
| Starts when | an agent stopped (question, repeated failure, spent budget, closed PR) or a person wants to steer running work |
| Done when | answered and resumed, tried again, split, taken over in the editor, given context, or cancelled |
| How often | daily |
| Decided | "Needs you" always carries its reason and a fix ([Unfold ADR-0024](../../apps/unfold/docs/adrs/0024-unfold-opens-on-now-with-one-vocabulary-and-one-token-system.md), proposed); a spent budget stops the Shift and offers a split, never a silent top-up ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)); context added while steering reaches the next Run ([ADR-0022](../adr/adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering.md)); Try again is a requeue from a chosen Round, with the actor recorded (Ploeg ADR-0044), and it happens in Unfold, never by reassigning in the tracker (owner, [VIK-2019](https://vikunja.webgrip.dev/tasks/2019)) |
| Enterprise | who may raise a budget, cancel, discard, take over (*open*, [VIK-2011](https://vikunja.webgrip.dev/tasks/2011)); each choice audited |
| States | each stop reason · no permission for a path · budget split proposed · work already resumed elsewhere |
| Success measure | time from stop to resume; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Understand why | Work Item page | works: about 25 reasons with a fix |
| Try again | Work Item page | partly: requeue exists in Ploeg and the VS Code host; the web page says to reassign in the tracker |
| Give context | Work Item page | works: add context files |
| Take over | VS Code | partly: checkout link and the VS Code agent host |
| Cancel or discard | Work Item page, tracker | partly: cancel works; discard means closing the tracker task |

### 5. Make work Ready

| | |
|---|---|
| Actors | product owner (responsible), refinement agent (drafts), developer (consulted), client (approves the quote, phase 2) |
| Starts when | a request or a rough ticket |
| Done when | Ready work with acceptance conditions, a size and an approved quote |
| How often | weekly rhythm, daily touches |
| Decided | Ready means decided, or described well enough to conceive a solution ([ADR-0003](../adr/adr-0003-the-unit-of-work-is-the-work-item.md)); a refinement Role drafts work items with acceptance conditions and a size and cannot dispatch; a ready-check runs before spend; the agency may override it ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)); sizes S, M, L, no XL ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)); the tracker owns priority |
| Enterprise | product-owner permissions per Client or project (*open*); brief versions kept |
| States | missing information · client has not answered · size above L (split) · quote rejected |
| Success measure | share of work that reaches Ready without a second refinement round; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Capture | tracker, portal | partly: tracker only |
| Draft | refinement agent | missing for tracker tasks |
| Size and quote | Unfold, portal | missing |
| Prioritise | tracker | works |

*Open: whether a product owner working in Unfold changes "the tracker owns priority" (owner, Q3 and [VIK-2020](https://vikunja.webgrip.dev/tasks/2020)).*

### 6. A client gets a change delivered (phase 2)

| | |
|---|---|
| Actors | client (responsible for asking and approving), account manager or product owner (accountable), reviewer (consulted) |
| Starts when | the client sends a request |
| Done when | the change is accepted and the client has seen it on a preview |
| How often | per request |
| Decided | the Client Portal is part of Unfold; clients approve quotes, open previews by signed link and add context to their own work only; Unfold never contacts a client directly; client feedback on a preview is input to acceptance, not acceptance; the agency sends a monthly report ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md), [ADR-0008](../adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)) |
| Enterprise | client users reach only their Client's work; the agency chooses which numbers clients see |
| States | waiting for quote · quote approved · in progress · preview ready · accepted · disputed |
| Success measure | time from request to delivery; baseline: not instrumented |

Every stage is missing: the portal is not built ([VIK-1500](https://vikunja.webgrip.dev/tasks/1500)). Stakeholder sign-off after a deploy, decided for the workbench in [VIK-1830](https://vikunja.webgrip.dev/tasks/1830), belongs to this journey.

### 7. Steer cost, quality and pace

| | |
|---|---|
| Actors | agency owner (responsible), tech leads (consulted), finance (informed) |
| Starts when | a weekly or monthly review, or a budget alert |
| Done when | I know cost per accepted change, where rework comes from and how loaded reviewers are, and I changed a budget, Team or policy if needed |
| How often | weekly |
| Decided | budget alerts at 50, 75, 90 and 100 % and work pauses at the cap; a monthly budget per client enforced by Ploeg; a kill switch stops all of the agency's Runs ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md), [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md), [ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)); unknown spend reads "Not reported", never zero; no per-person scores ([ADR-0023](../adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md)) |
| Enterprise | money visible only to roles allowed to see it; export for finance |
| States | data missing for a period · budget reached · kill switch on |
| Success measure | the owner can answer "did this month pay off?" from one screen; baseline: no |

| Stage | Where | Today |
|---|---|---|
| Read the numbers | Insights | partly: spend and Runs per Team; no cost per accepted change, rework or review load |
| Act | Insights, configuration | missing: budgets and the kill switch have no screen |
| Report to clients | portal, mail | missing |

### 8. Set up and govern an organisation

| | |
|---|---|
| Actors | admin or platform engineer (responsible), agency owner (approves) |
| Starts when | a new agency, client, project or person |
| Done when | people sign in with SSO into the right Tenant with the right role, and projects are connected |
| How often | at onboarding, then monthly changes |
| Decided | one Tenant per agency, Clients inside it, SSO groups `unfold/<tenant>/<role>` and `unfold/<tenant>/client/<client>`, no data without a group, a Tenant switcher, Unfold staff never see Tenant content ([ADR-0009](../adr/adr-0009-one-tenant-per-agency.md), [ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)); agencies define their own Teams; the hosted pilot runs 4 to 6 weeks on 5 to 10 real tickets ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md)) |
| Enterprise | roles and permissions (*open*, [VIK-2011](https://vikunja.webgrip.dev/tasks/2011)); provisioning (*open*, R6); policies such as auto-start and review routing set here |
| States | identity provider misconfigured · group mapped to no role · person removed upstream · Team in two Tenants refused |
| Success measure | time from signed pilot to the first accepted pull request; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Sign in | Unfold | works: OIDC with three global roles |
| People and roles | Unfold | missing: no screens; Tenants and SSO group mapping are M1 work |
| Sources, Teams, secrets | configuration files | partly: files only; stage by stage on [Connect a repository](connect-a-repository.md) |
| Health | Status | works |

### 9. Curate what agents know

| | |
|---|---|
| Actors | Tenant admin or lead (responsible), reviewer (proposes), client (reads its own) |
| Starts when | a Run proposes a learning, or a person wants agents briefed differently |
| Done when | accepted learnings and Definitions of Ready and Done reach the next Run; rejected ones never do |
| How often | weekly |
| Decided | learnings a Run proposes need a person to accept them before any Run sees them (Ploeg ADR-0066, proposed; [ADR-0021](../adr/adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md), proposed); each Client has a Definition of Ready, a Definition of Done and agent instructions ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)) |
| Enterprise | who may accept learnings; clients read only theirs |
| States | nothing proposed · conflicting learnings · learning about another client's code |
| Success measure | share of fix Rounds caused by a mistake a learning already covered; baseline: not instrumented |

Every stage is missing in Unfold: learnings exist only inside Ploeg. This journey feeds journey 1: the reviewer's summary shows what was learned.

### 10. Prove and settle what happened

| | |
|---|---|
| Actors | agency owner (responsible), auditor or client (asks), finance (informed) |
| Starts when | a defect, a dispute or a compliance question about a change |
| Done when | an answer with evidence for that change, exported; a reversal or dispute settled if needed |
| How often | rare, decisive |
| Decided | a reversal refunds the fee when a change is reverted within 14 days for a defect; a dispute gives 10 working days' notice ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)); every PR states that an agent wrote it and who reviewed it ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md)) |
| Enterprise | audit events, retention and export (*open*, [VIK-2013](https://vikunja.webgrip.dev/tasks/2013)) |
| States | part of the chain missing · change spans several attempts · client asks about another client's change (refused) |
| Success measure | time to answer a question about one change; baseline: not instrumented |

| Stage | Where | Today |
|---|---|---|
| Find the change | Work, Runs, Activity | works |
| See its chain | Work Item page, Activity | partly: events and Run cards exist, not one chain |
| Export | — | missing for Ploeg work |
| Settle | — | missing |

## What changed against the first draft of 2026-10-11

- **Accept and sign off** is no longer its own journey: the developer's review *is* acceptance ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)), so it is journey 1; stakeholder sign-off on a preview moved to the client's journey 6.
- **Hand over** and **let Ready work start itself** are one journey with two entry points (3); setting the policy belongs to governance (8).
- **Steering running work** joined **resolve what needs me** (4), because adding context and trying again use the same screen.
- **New:** the client's own journey (6), decided in ADR-0005 and ADR-0007 but missing from the draft, and **curate what agents know** (9), which the owner's note about learnings in the review summary depends on.

## Open questions

Round 2 ([VIK-2009](https://vikunja.webgrip.dev/tasks/2009)) holds R1 to R12. Reading the decision records for this page added eight more. The owner decided three on 2026-10-14: the Access Role names ([VIK-2011](https://vikunja.webgrip.dev/tasks/2011)), Try again happens in Unfold, and a spent budget is split, never topped up ([VIK-2019](https://vikunja.webgrip.dev/tasks/2019)). These remain, each with the owner as the one who decides:

1. **Notification scope.** ADR-0026 notifies "people who can read that Team"; ADR-0017 makes Tenant and Client the boundary, not Team.
2. **Who opens the pull request.** Unfold ADR-0016 has it opened as the signed-in person; Unfold ADR-0040 uses the publisher identity.
3. **Client steering.** ADR-0017 lets client users add context but not steer; ADR-0031 leaves client steering open.
4. **Client contact.** ADR-0007 has clients talk to the refinement agent, while Unfold never contacts clients; is the refinement conversation in the portal an exception?
5. **Auditor and finance.** Are they users of Unfold, or served by exports only?
