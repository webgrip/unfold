# Questions that change the architecture

This is a discussion guide, not an implementation backlog. Open language choices also appear in the [domain model](../domain/model.yaml). Agreed answers should update the definitions and diagrams; do not preserve answered questions as competing meanings.

## Product intentions

- The aim is a supported way to work with AI for developers and non-human operators, with visibility into telemetry, costs, decisions, and results.
- Vloer is the place the developer starts. The particular harness is an implementation choice.
- Vloer supports the intended start of open AI conversations without a ticket. Ticket systems remain external.
- Local work must be usable without any Ploeg service. Each execution has one explicit authority; Ploeg-managed work cannot switch itself to standalone authority.
- Software work should be checked and reviewed by agents before human review. A CI failure gets a repair subticket; agents automatically fix it in projects where the behavior is enabled, including human-written changes.
- A person initially reviews and accepts the prepared result. Automatic acceptance can be agreed later.
- Large agent counts are a possible execution capacity. Ticket quality, testable results, and production delivery must keep up.
- Research can finish with evidence and a clear recommendation not to build. A rejected business case does not require an unnecessary prototype.

## Round one: responsibility

**A developer starts local work.** The product direction requires this to work without Ploeg. Current standalone Vloer supports that path, with a registered repository and crew. Repository-free conversation and fully offline model inference are separate capabilities; neither follows from independence from Ploeg.

**Both applications need execution machinery.** Separate three choices: who authorizes work, where the runner executes, and which code is reused. A common runner could implement workspace setup, harness invocation, interruption and evidence capture while Ploeg retains scheduling and budgets and Vloer retains interaction. This is a proposal, not a new accepted component. First compare the two existing execution paths and identify behavior that actually must match. Go and TypeScript do not become a shared library merely by moving into one repository; a process or wire contract may be the useful boundary.

**A Ploeg-managed runner loses its connection.** It retains Ploeg's authority; it cannot turn itself into standalone work. Define whether it stops immediately or continues within an unexpired grant, then test expiry, revocation, duplicate-start prevention and evidence reconciliation. A deliberately standalone run has no Ploeg connection to lose. The [transition plan](../monorepo-transition.md) makes these two cases the first comparison.

**A worker fails.** Its execution authority owns the decision whether another attempt is allowed; the runner reports what actually happened. Which failures permit another attempt, and what budget or attempt limit requires human intervention?

**The result looks good.** A person initially accepts it after checks and agent review. Who may deploy it afterward, and how do we confirm its actual effect? Keep execution completion, acceptance, and production release separate.

## Round two: what the shared entry point promises

Must an agent use the same API as a person, or must they merely follow the same ticket, budget, and evidence rules? Recommendation: share the rules and identifiers; do not force unattended software through a browser session.

When an open conversation becomes code work, which details become required: repository, branch, ticket, acceptance conditions, or release destination? Free conversation is supported intent; the transition into a deliverable needs a clear rule.

Who writes and edits the ticket: the existing tracker, Vloer, an agent, or all three? If more than one can edit it, which copy is authoritative and what happens when its requirements change during execution?

## Round three: decisions and evidence

When we say “show why,” which records must be available: the initial instructions, retrieved sources, tool actions, approval decisions, design decisions, or a written explanation from the agent? Recommendation: require concrete decision records with evidence and responsible actors. Do not promise access to a model's hidden internal reasoning.

What proves success for code, market research, a design document, or a production experiment? Each needs an explicit acceptance condition. A test suite is useful evidence for software; it does not establish a market opportunity.

Where does a repair subticket belong if a human-written change has no original ticket? How do repeated reports of the same CI failure update one repair instead of creating an endless set of subtickets?

Which spending number may leadership rely on: authorized limit, provisional gateway estimate, or reconciled provider charge? Recommendation: show each with its own label and never display unknown spend as zero.

## Round four: increasing capacity

What must be true before raising concurrency: enough ready tickets, a maximum spend rate, reliable cleanup, fast enough reviews, acceptable test failures, or sufficient deployment capacity? Which of those should stop new work automatically?

May agents create new tickets freely? May they assign those tickets and spend money on them, or is that a separate approval? Creating a proposal and authorizing its execution are different powers.

What should “agents talk to each other” accomplish first: ask an expert a question, share findings, divide independent work, or negotiate a plan? Recommendation: begin with one named interaction and its evidence, rather than introducing a general messaging layer before the need is clear.

## Round five: whether custom software is justified

Which requirement would justify maintaining Ploeg and Vloer if a bought or existing product completes the same workflow? Is it the self-hosted tracker/forge combination, control over execution rules, interchangeable providers, organizational support, or something else?

What would cause us to remove one of our components? Recommendation: agree on a small comparison workflow and accept replacement when an alternative meets it with lower total operating cost. See the [alternatives](../research/2026-09-11-ecosystem-alternatives.md).
