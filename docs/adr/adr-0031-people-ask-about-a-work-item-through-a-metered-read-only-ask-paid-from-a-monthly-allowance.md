---
status: proposed
date: 2026-10-10
decision-makers: Ryan Grippeling
---

# People ask about a Work Item through a metered, read-only Ask paid from a monthly allowance

## Context and Problem Statement

The owner wants one place to talk about work: to ask what an agent is doing, and later to hand an agency's Clients the same ability. Today the only way to talk to running work is steering. `POST /api/sessions/:id/messages` stores an operator `message` event, and Unfold folds every such event into the next Run's prompt (`apps/unfold/src/engine.ts`, `message()` and the prompt builder). A question typed there changes what the agent does. Nothing answers "how far is it, why did it stop, what has it cost" without touching the agent.

Answering in words needs a model call, and [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) gives Ploeg the authority over every model call. Ploeg can authorize, cap and meter one Run's calls through a LiteLLM key, but it admits only a writing `operator` Run that creates a Work Item, a Shift and a Lease. It has no monthly budget of any kind. [ADR-0007](adr-0007-clients-approve-ready-work.md) already names a monthly allowance per Client for refinement, and [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md) says Ploeg enforces every Budget before spend.

How does a person ask about a Work Item, who pays for the answer, and what may the answer reveal?

## Decision Drivers

* An Ask never reaches or changes the agent doing the work.
* Every Ask is authorized, capped and metered by Ploeg, like any Run, and its cost is visible to the person asking.
* Ask spend is paid from an allowance, not from the Work Item's Shift Budget, so asking never eats the budget of the work it asks about.
* The same feature serves the owner now and an agency's Clients later ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)), so the answer is built only from facts a Client may see.
* A deterministic demo never invents a model call or spend.

## Considered Options

* A read-only Ask Run on the existing Work Item, outside its Shift, paid from a monthly Ask Allowance
* Reuse steering: send the question as a message and let the next Run answer
* Answer from the record with rules and no model
* Let Unfold call a model with its own key, as card art does

## Decision Outcome

Chosen option: "A read-only Ask Run on the existing Work Item, outside its Shift, paid from a monthly Ask Allowance", because it is the only option that answers in words, never touches the agent, and keeps Ploeg as the authority over the spend.

**What an Ask is.** A person types a question on a Work Item. Unfold asks Ploeg to admit an **Ask**: a Run with the Role `ask` that reads only, belongs to the Work Item, has no Shift, no Lease and no workspace. Ploeg authorizes it against the asker's **Ask Allowance**, mints a key capped at the per-Ask Budget and scoped to the `ask` Role's one model, and returns it to Unfold. Unfold makes one model call with that key and a **Work Item brief**, stores the question and the answer, and tells Ploeg the Ask is done. Ploeg blocks the key and settles the Run like any other.

**Asks, not steering.** An Ask can explain, never act. It has no tools and its answer is text. Unfold stores Asks apart from the Session event stream, so an Ask never becomes an operator message or part of a prompt. Steering stays a separate action for the agency's people. When a question is really a new wish, the answer can say so and offer to start a Request; it does not start one itself. Steering by Clients, and other ways for Clients to influence running work, are left for a later decision.

**The Work Item brief.** The model sees a projection of the Work Item that contains only Client-safe facts: its title, objective and Acceptance Conditions, its state and why it waits, the Roles that ran with their state, summary and Verdict, the pull request and preview status, and spend totals with their cost status. It never contains prompts, tool input or output, transcripts, diffs, gateway request details, per-model usage, operator notes, failure internals or another Work Item's facts. The same brief serves the owner and a Client, so the internal view needs no second filter later. The question is untrusted input; the model is told to answer only from the brief and to say when the brief does not answer it.

**The Ask Allowance.** An allowance is a monthly amount of Ask spend held by a scope: a Team in phase 1, a Client in phase 2 ([ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) makes the Tenant own budgets). Ploeg admits an Ask only when the allowance's limit minus settled and held Ask spend covers the per-Ask Budget, under the same locking as a Shift pool. When the allowance is used up, Unfold says so, says when it resets, and the agency can raise it; nothing is topped up silently. The numbers are in [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md#decided-numbers) with the other prices.

**Ask spend is reported apart from delivery spend.** A Work Item's card and receipt keep showing what building it cost. Ask spend appears beside it as "asked about it", so asking never inflates the price of the work.

**Where it lives.** Ask is a Work Item feature, reachable from the Work Item page, the Session page and Now. Ploeg adds an operator endpoint that admits an Ask on a Work Item and a ledger for allowances, recorded in its own ADR. Unfold adds the brief, a store for Asks and the Ask panel. In the deterministic demo an Ask answers from the brief with fixed rules, says it is a demo, and shows no spend.

Not implemented yet.

### Consequences

* Good, because people can find out where work stands in their own words without disturbing or paying for the work itself.
* Good, because every answer has a known, small, capped cost that the asker sees.
* Good, because the brief is defined once and is safe to show a Client, which the Client Portal ([ADR-0007](adr-0007-clients-approve-ready-work.md)) needs anyway.
* Bad, because an answer is only as good as the brief. A question about code or a diff gets "I can't see that" until the brief carries more.
* Bad, because Ploeg gains a Run kind with no Shift and a monthly ledger, both new concepts to keep consistent with settlement and recovery.

### Confirmation

Confirmed when:

* a Ploeg admission test shows an Ask is refused once the scope's allowance cannot cover the per-Ask Budget, and that an admitted Ask creates no Shift and no Lease;
* an Unfold test shows a brief built from a Work Item with prompts, tool events, diffs and operator notes contains none of them;
* an Unfold test shows an Ask never appears in the prompt of a later Run; and
* a demo test shows an Ask answers without a model call and shows no spend.

## Pros and Cons of the Options

### Reuse steering

* Good, because it needs no new path.
* Bad, because the question becomes an instruction to the agent and costs part of the Work Item's Shift Budget.
* Bad, because a Client could change the work they asked about.

### Answer from the record with rules

The Session page's Investigate button already does this for "why did it stop".

* Good, because it costs nothing and is deterministic.
* Bad, because it answers only questions someone wrote a rule for. It stays as the demo's answer.

### Let Unfold call a model with its own key

* Good, because it is the simplest to build.
* Bad, because the spend bypasses Ploeg's authorization, budgets and settlement, which [ADR-0002](adr-0002-ploeg-is-the-only-engine.md) forbids.

## More Information

* 2026-10-10 — The owner asked for a place to chat about what agents are doing and to give new work, for themselves and for agency Clients, and decided that chatting about work is charged like any model use.
* 2026-10-10 — The owner decided that Clients only ask for now; steering and other ways to influence running work may come later.
* 2026-10-10 — The owner chose an allowance as the charging model, and decided that prices and allowances are discussed in the open.
* 2026-10-10 — Proposed.
* Related: [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md), [ADR-0007](adr-0007-clients-approve-ready-work.md), [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)
