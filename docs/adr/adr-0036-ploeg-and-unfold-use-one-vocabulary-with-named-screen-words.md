---
status: accepted
date: 2026-10-13
decision-makers: Ryan Grippeling
---

# Ploeg and Unfold use one vocabulary, with named screen words

## Context and Problem Statement

An audit of both domain models on 2026-10-13 found one concept carrying several names:
- the screens say "crew" about 92 times while the glossary says Team;
- one Shift is also called an "attempt";
- people see "Running" where API and MCP clients get `leased`, a state name Ploeg's own glossary calls wrong;
- money set aside is "authorized", "reserved", "held" or "hold";
- the tracker's item is a Tracker Item, a "task" or a "ticket";
- five value sets say how sure a cost figure is, and Ploeg says `provisional` where Unfold says `pending`;
- Sizes are priced in euros while Ploeg holds every budget in US dollars, and nothing says where one becomes the other.

Which word does each concept get, and where may a screen use a friendlier word?

## Decision Drivers

* One concept, one canonical term, owned by one app, following the term ownership rule: Ploeg owns a term when Ploeg stores it or its API names it, and Unfold imports it ([system ADR-0002](adr-0002-ploeg-is-the-only-engine.md) makes Ploeg the engine).
* A screen may use an everyday word for a canonical term, but only when that word is recorded, so it is a choice and not drift.
* People who are not developers read the screens: clients, product owners, the owner's colleagues.

## Considered Options

* One canonical term per concept, each friendlier screen word recorded next to it
* Free screen wording, with only the glossary kept consistent
* One word everywhere, screens included, with no screen words

Per concept the owner chose from two or three options; the rejected ones are under Pros and Cons.

## Decision Outcome

Chosen option: "One canonical term per concept, each friendlier screen word recorded next to it", because it keeps the glossary exact for agents and developers while letting screens speak to people who are not developers, and makes every difference a recorded choice.

1. **Team, everywhere.** "Crew" is retired from screens, docs and code. Team is Ploeg's term.
2. **Shift, with "attempt" as its screen word.** Docs, API and glossary say Shift. Screens may say "attempt" ("2 agent runs in 1 attempt"), recorded as Shift's screen word in Unfold's table of Ploeg words.
3. **A Work Item being worked on is `active`.** Ploeg renames the state `leased` to `active` and retires `leased`. Because this changes Ploeg's API, Unfold accepts both values until every Ploeg it talks to sends `active`. Screens keep saying "Running".
4. **Money set aside is a Hold.** A Hold is money held against a budget for work that has started but not settled; "held" is its verb and adjective. "Authorized" keeps one meaning, the ceiling a budget allows. Ploeg owns the term, and its API fields move from `reserved…` to `held…` the same way as the state rename.
5. **Tracker Item, with "task" as its screen word.** The item in a tracker is a Tracker Item in docs and API, and a "task" on screens (the Tasks page stays). "Ticket" is used only for the billing unit of [system ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md).
6. **One cost status, owned by Ploeg.** Every money figure carries one of `observed` (seen so far, still moving), `provisional` (settled once, still correctable), `settled` (final) or `unknown`. Screens say "so far", "not final yet", "final" and "not known yet". Unfold's `pending` is retired.
7. **Euros become dollars at admission.** Sizes, Credits and invoices stay in euros. When Unfold hands a Work Item to Ploeg, it converts the euro Shift Budget into the US dollars Ploeg holds, at a stored ECB rate, and keeps that rate with the Work Item so the invoice can be reconciled. Ploeg stays single-currency.

### Consequences

* Good, because each concept has one term, and every friendlier screen word is written down next to it.
* Good, because people stop seeing "crew" and "Team" for the same thing, or "pending" and "provisional" for the same cost.
* Bad, because decisions 3 and 4 change Ploeg's API: they need a Ploeg release, an Unfold change that accepts both forms first, and a retirement date for the old forms.
* Bad, because retiring "crew" touches many strings, docs and identifiers in Unfold. Until the sweep lands, the code and this record disagree.

### Confirmation

* The combined glossary refuses a retired word that a model still defines, and Unfold's contract test against Ploeg's schema fails when a Ploeg value has no screen label.
* Each decision is implemented when the glossary, the table of Ploeg words and the code agree; until then this record says what is decided, not what is built.

## Pros and Cons of the Options

* Crew as a screen word for Team, or Crew as the Roles running now: rejected, because two words for one concept is the problem this record fixes, and nobody needed a separate word for the running Roles.
* Shift on screens too, or renaming Shift to Attempt everywhere: rejected; "Shift" needs explaining to a reader who is not a developer, and a cross-repo rename buys nothing a recorded screen word does not.
* Keep `leased` and show "Running" in MCP too: rejected, because Ploeg's own glossary records that `leased` describes the wrong thing.
* Reserved or Authorized as the money word: rejected; "authorized" already names the ceiling, and "hold" is the word people know from card payments.
* Task or Ticket as the glossary term: rejected; Ticket is the billing unit, and "task" is too general for a glossary term that Ploeg's API names.
* Keeping Unfold's `pending` and translating: rejected, because a person and the Ask model saw different words for the same Ask.
* Budgets in dollars, or a currency field in Ploeg: rejected; clients buy in euros, and a currency in Ploeg spreads billing into the engine.

## More Information

* 2026-10-13 — The owner chose these words in two rounds of questions after the domain language audit. Accepted; not implemented yet.
* Related: [system ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md), [system ADR-0030](adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md), [system ADR-0031](adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md).
