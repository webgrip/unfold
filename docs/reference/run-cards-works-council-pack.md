---
type: reference
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-02
verified_by: "built data items read against Ploeg ADR-0045, ADR-0046, ADR-0047, ADR-0057 and ADR-0058 and apps/ploeg/pkg/store/{card,card_flow,statuses,play_pipeline}.go on feat/ploeg-card-pipeline; legal references taken from the 2026-10-01 gamification evidence record, not checked by a lawyer; nothing was run"
---

# Run Cards: works council and DPIA pack

> **Not legal advice.** This pack is a starting point that an employer adapts and reviews with its own counsel, data protection officer and works council. It summarises Dutch and EU rules as the research understood them on 2026-10-01. Unfold's authors are not lawyers, and nothing here guarantees that a deployment is lawful.

This pack helps an employer that runs Unfold with [Run Cards](../concepts/run-cards.md) consult its works council (*ondernemingsraad*, OR) and carry out a data protection impact assessment (DPIA). It holds a data inventory, the purposes, notes on the legal basis, a visibility matrix, retention, a "not for appraisal" clause, a sample consent request in Dutch and English, a DPIA outline and a note on the EU AI Act. The evidence behind it is in the [gamification evidence and law record](../research/2026-10-01-run-cards-gamification-evidence-and-law.md).

**Most of Run Cards is proposed, not built.** Each row below says which. Run this consultation before you switch on any proposed part, and again when a part is added.

## Why an employer needs this

* **Works council consent.** Article 27(1)(l) of the Dutch Works Councils Act (WOR) gives the OR a consent right over arrangements for facilities "aimed at or suitable for" observing or checking the attendance, behaviour or performance of staff ([WOR](https://wetten.overheid.nl/BWBR0002747/)). *Suitable for* means the intent does not matter: a system that names people next to the record of their work can qualify even if it is meant as fun. Article 27(1)(k) separately covers rules on processing staff personal data. A decision taken without consent is void if the OR invokes that within one month (article 27(5)). The consent right falls away where a collective labour agreement (CAO) already regulates the matter (article 27(3)).
* **Size thresholds.** An OR is mandatory from 50 employees. From 10 to 49, staff can ask for a staff representation (*personeelsvertegenwoordiging*, PVT) with narrower rights. **The GDPR applies whatever the size.**
* **A DPIA.** The Dutch Data Protection Authority (Autoriteit Persoonsgegevens, AP) lists monitoring of employees as an activity that needs a DPIA ([AP: controle van werknemers](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/werk-uitkering/controle-van-personeel), [AP: DPIA](https://www.autoriteitpersoonsgegevens.nl/nl/zelf-doen/data-protection-impact-assessment-dpia)). Person-linked cards meet at least three of the European criteria for one: evaluation, systematic monitoring and vulnerable data subjects, since employees count as vulnerable.

## What the system is

A Run Card is the record of one Work Item's change: which pull requests it took, what the AI agents cost, how review and CI went, where and since when it is deployed, and, as proposed, how well it held up. It describes the change. A person appears on it only in a role, most visibly as the **Steward**, the developer who answers for the change. Card state never changes what Unfold authorizes, budgets or merges.

## Data inventory

| Data | Example | Source | Person-linked | State |
| --- | --- | --- | --- | --- |
| Login of whoever merged a pull request | `j.devries` | forge webhook | yes | Built |
| Login, verdict and time of each review | `a.bakker`, approved, 14:02 | forge webhook | yes | Built |
| Steward, with how it was chosen | `j.devries`, `merged_by` | derived from the two rows above | yes | Built |
| Roster roles | merger, reviewer | derived | yes | Built |
| Event timeline with actor | review received, merged, closed | forge facts, Work Item audit | yes | Built |
| Merge and deploy times | merged 2026-10-01, in production 2026-10-03 | forge, deploy endpoint | via the change | Built |
| Cost, tokens, diff size, CI result | US$ 0,58, +214/−38, CI passed | Ploeg, forge | via the change | Built |
| Tracker status moves of the ticket, with the time of each and no actor | Doing 09:00, In test 14:00 | tracker | via the change | Built |
| Flow timings: time per status, lead and cycle time, flow efficiency, blocked time, queue time, merge to production, time to mend | cycle 27 h, efficiency 0,71 | derived from the rows above | via the change | Built |
| Pull request conversation events: login, kind and time of each comment, inline comment, review, push, force push and draft change, without any text | `a.bakker`, comment, 10:12 | forge read | yes | Built |
| Pull request opening time, author login, commit count and earliest commit time | opened 09:00 by `ploeg-bot`, 4 commits | forge read | yes | Built |
| CI run and job timings: job name, status, start, end, queue time and attempt, without logs | `test`, failed, 3 min, attempt 2 | forge read | via the change | Built |
| Review and CI figures: time to first feedback, approval and merge, review rounds, comments, CI reruns, minutes, time to green | first feedback after 1 h, 2 reruns | derived from the three rows above | via the change | Built |
| Change shape: indentation complexity, counted lines, test ratio, documentation files, languages, measured from the diff without keeping it | complexity +42, test ratio 0,44 | forge diff at the merge | via the change | Built |
| Tracker assignee as Steward | `j.devries` | tracker | yes | Proposed |
| Further roles: developer, QA, PO, acceptor | `m.jansen`, QA | tracker transitions, commits | yes | Proposed |
| Gate moves and Bounces, with actor and reason | test → development, defect | tracker | yes | Proposed |
| Crack proposal, confirmation and dispute | fixer, confirmer, Steward's response | Unfold | yes | Proposed |
| Mend, with who fixed it | mended by `a.bakker` | Unfold | yes | Proposed |
| What a signer said they checked | tests read, behaviour run | Unfold | yes | Proposed |
| Binder contents, shared cards, events seen | the cards a person holds | Unfold | yes | Proposed |
| Pack openings and cosmetic pulls | sprint 41, gold signature on card 138 | Unfold | yes | Proposed |

Change data such as cost or diff size is about the change, but on a card that names a Steward it relates to that person too. Treat it as personal data in the DPIA. Flow timings count calendar time and the team's working hours, and Ploeg keeps no name with a status move. Waiting and blocked time say how work moves through the team's process, not how fast a person works. They are never added up per person and never feed a grade or a rarity. The pull request and CI figures work the same way: Ploeg keeps who commented or reviewed and when, but no comment or review text, no code and no CI log, and time to first feedback measures the team's response, not the author. Run Cards hold no special categories of personal data. Git history and the forge keep authorship on their own, outside Unfold and outside this inventory.

## Purposes

**Purposes:**

1. Show the people who worked on a change, and their team, the record of that change and how it holds up in production.
2. Tell the right person when a change needs mending, and credit whoever reports and mends it.
3. Give clients team-level evidence of delivered work, such as cost, mend status and days live.
4. Operate and secure Unfold.

**Not purposes**, and excluded in writing: performance appraisal, pay, promotion, discipline, ranking people, and assigning work by a person's track record.

## Legal basis

* **Legitimate interest, not consent.** Employees can rarely give free consent to their employer. The European Data Protection Board names monitoring and assessment as examples ([EDPB Guidelines 05/2020](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf)). The likely basis is the employer's legitimate interest (GDPR article 6(1)(f)), after a written balancing test. Processing at work must be strictly necessary, proportionate and subsidiary, with clear information to staff ([WP29 Opinion 2/2017](https://collab.dpa.gr/wp-content/uploads/2023/07/WP29_Opinion-2-2017-on-data-processing-at-work.pdf)).
* **Opt-in is a safeguard, not the basis.** Letting a person choose to share cards helps motivation and fairness. It does not replace the legal basis.
* **Avoid profiling by design.** Evaluating "performance at work" is profiling (GDPR article 4(4)). Run Cards never total card data per person in a shared view, which keeps the design away from it. A configuration or report that adds such totals changes this analysis.
* **Inform staff before you start** (GDPR articles 13 and 14), with the purposes, the basis, the visibility matrix, retention and the rights below.
* **Data subject rights.** Give each person an export of their card data (article 15), a way to contest a Crack attribution or a wrong role (article 16), and a way to object (article 21), which the balancing test must be able to answer.

## Visibility matrix

The owner decided the visibility rules on 2026-10-01: Binders are private, team pages are for the team, and clients see team aggregates only. None of the views beyond the single card are built yet.

| What | The person | Their team | Their manager | A client |
| --- | --- | --- | --- | --- |
| A single card on its Work Item page, with Steward and Roster | yes | yes | yes, as a team member, change by change | no |
| The person's Binder (their collection) | yes | only cards they choose to share | **no** | no |
| Team page: Cracks per team, mend time, days live, rework, change fail rate | yes | yes | yes | no |
| Team aggregates per client: deliveries, cost, mend status | yes | yes | yes | yes, team level only |
| A named person's history across cards | yes, their own | no | **no** | **no** |
| Per-person totals of level, Cracks, grade, cost or lines | none exist | none exist | none exist | none exist |
| Pack pulls | yes | if shared with a card | no | no |

## Retention and pseudonymisation

Proposed defaults, configurable per installation:

* **Person link on cards:** replaced by a pseudonym 12 months after the card's release, or when the person leaves, whichever comes first. The record of the change stays, with roles but without the name.
* **Binders:** deleted when the person leaves, after offering them an export.
* **Crack disputes:** the outcome stays on the card, pseudonymised like the rest; the discussion is deleted after 12 months.
* **Pack pulls:** kept with the card, under the same pseudonymisation.

**Not implemented yet.** Today Ploeg keeps the logins of mergers and reviewers with no retention limit. Until retention is built, an employer has to document and run its own deletion or accept the gap in its DPIA.

## The "not for appraisal" clause

Put this, or your counsel's version, in the product terms, the staff notice and the works council agreement.

> **English.** Run Card data describes changes to software, not the people who made them. [Employer] does not use Run Card data, or anything derived from it, in performance reviews, appraisal, pay, promotion, discipline, dismissal or the allocation of work to individuals. Managers have no access to an individual's Binder. [Employer] will not configure, export or report Run Card data as per-person totals or rankings. Any change to this clause needs the works council's prior consent.

> **Nederlands.** Gegevens op Run Cards beschrijven wijzigingen in software, niet de mensen die ze maakten. [Werkgever] gebruikt deze gegevens, en alles wat daaruit is afgeleid, niet bij functionerings- of beoordelingsgesprekken, beloning, promotie, disciplinaire maatregelen, ontslag of het toewijzen van werk aan personen. Leidinggevenden hebben geen toegang tot de verzameling (Binder) van een medewerker. [Werkgever] stelt geen overzichten, exports of rapporten op die Run Card-gegevens per persoon optellen of rangschikken. Voor elke wijziging van deze afspraak is vooraf instemming van de ondernemingsraad nodig.

## Sample consent request

Adapt the bracketed parts, remove the proposed features you will not switch on, and attach the visibility matrix and your DPIA.

### Nederlands

**Verzoek om instemming: Run Cards in Unfold**

Aan: de ondernemingsraad van [organisatie]
Van: [naam bestuurder]
Datum: [datum]

Beste leden van de ondernemingsraad,

We gebruiken Unfold: AI-agents bereiden daarin pull requests voor, en onze ontwikkelaars beoordelen ze. We willen in Unfold de functie Run Cards aanzetten. Die functie kan geschikt zijn om gedrag of prestaties van medewerkers waar te nemen. Daarom vragen we jullie instemming op grond van artikel 27 lid 1 onder l van de Wet op de ondernemingsraden. Omdat het ook gaat over het verwerken van persoonsgegevens, vragen we instemming op grond van artikel 27 lid 1 onder k.

**Wat is een Run Card?**
Een Run Card is een kaart per ticket. Op de kaart staat wat er aan dat ticket is gedaan: welke pull requests er waren, wat de AI-agents kostten, hoe de review en de tests gingen, en sinds wanneer de wijziging in productie draait. De kaart gaat over de wijziging, niet over de persoon.

**Waarom willen we dit?**
We willen dat het zichtbaar en leuk wordt om goed voor een wijziging te zorgen, ook nadat die live staat. Als er een fout in zit, willen we dat de juiste persoon dat hoort, en dat wie een fout meldt of herstelt daar erkenning voor krijgt. Klanten willen we op teamniveau laten zien wat we hebben opgeleverd.

**Welke gegevens over medewerkers gebruikt de functie?**

* je gebruikersnaam in Git als je een pull request beoordeelt of samenvoegt;
* je rol bij het ticket, zoals ontwikkelaar, reviewer, tester of product owner;
* tijdstippen, zoals wanneer je beoordeelde of samenvoegde;
* wie de steward is: de ontwikkelaar die het ticket draagt;
* [alleen als we dit aanzetten:] wie een fout bevestigde of herstelde, en wat iemand zegt te hebben gecontroleerd voordat die tekende.

**Wie ziet wat?**

* Je eigen verzameling kaarten (je Binder) zie alleen jij. Je kunt zelf losse kaarten delen.
* Je team ziet de kaarten van zijn eigen tickets en een teampagina met teamcijfers.
* Leidinggevenden zien geen verzameling van een medewerker en geen cijfers per persoon.
* Klanten zien alleen cijfers op teamniveau, nooit namen.

**Wat doen we niet?**

* We maken geen ranglijsten en tellen niets op per persoon.
* We gebruiken de gegevens nooit bij beoordeling, beloning, promotie, disciplinaire maatregelen of het verdelen van werk. Die afspraak leggen we vast (zie bijlage).
* Geen computer of AI geeft een cijfer aan een persoon. Een cijfer op een kaart gaat altijd over de wijziging.
* Er zijn geen streaks, en er komen geen meldingen die je in het weekend of na werktijd terug laten komen.
* Een fout komt alleen op een kaart als twee mensen het bevestigen. De steward kan bezwaar maken.

**Hoe lang bewaren we de gegevens?**
Na 12 maanden, of als je uit dienst gaat, vervangen we je naam op de kaarten door een pseudoniem. De beschrijving van de wijziging blijft bestaan. Je verzameling verwijderen we als je uit dienst gaat; je kunt die eerst downloaden.

**Hoe proberen we het uit?**
We starten met een proef van ten minste 10 weken bij [team]. We beoordelen de proef met een anonieme enquête over eigenaarschap en zorg, en met teamcijfers over herstelwerk en mislukte wijzigingen. Het aantal kaarten telt niet mee. Een team kan de functie altijd uitzetten. Na de proef bespreken we de resultaten met jullie, voordat we de functie breder invoeren.

**Wat vragen we van jullie?**
We vragen jullie instemming met deze regeling, graag binnen [aantal] weken. We lichten het voorstel graag toe in een overlegvergadering. Jullie kunnen ook vragen stellen of wijzigingen voorstellen. Bijlagen: het overzicht van wie wat ziet, de afspraak "niet voor beoordeling" en de DPIA.

Met vriendelijke groet,
[naam, functie]

### English

**Request for consent: Run Cards in Unfold**

To: the works council of [organisation]
From: [name of the director]
Date: [date]

Dear members of the works council,

We use Unfold, where AI agents prepare pull requests that our developers review. We want to switch on the Run Cards feature in Unfold. It may be suitable for observing the behaviour or performance of employees, so we ask for your consent under article 27(1)(l) of the Works Councils Act. Because it also concerns processing personal data, we ask for consent under article 27(1)(k) as well.

**What is a Run Card?**
A Run Card is one card per ticket. It shows what was done for that ticket: which pull requests there were, what the AI agents cost, how review and tests went, and since when the change has been live. The card is about the change, not about the person.

**Why do we want it?**
We want caring for a change to be visible and fun, also after it goes live. When something breaks, the right person should hear about it, and whoever reports or fixes a fault should get credit. For clients, we want to show what we delivered at team level.

**Which data about employees does it use?**

* your Git username when you review or merge a pull request;
* your role on the ticket, such as developer, reviewer, tester or product owner;
* times, such as when you reviewed or merged;
* who the steward is: the developer who carries the ticket;
* [only if we switch this on:] who confirmed or fixed a fault, and what someone says they checked before signing.

**Who sees what?**

* Only you see your own collection of cards (your Binder). You can share single cards yourself.
* Your team sees the cards of its own tickets and a team page with team figures.
* Managers see no employee's collection and no figures per person.
* Clients see team figures only, never names.

**What we will not do**

* We make no rankings and add nothing up per person.
* We never use the data in appraisal, pay, promotion, discipline or the allocation of work. We put that in writing (see the attachment).
* No computer or AI gives a person a score. A score on a card is always about the change.
* There are no streaks, and no notifications that pull you back at weekends or after hours.
* A fault goes on a card only when two people confirm it. The steward can object.

**How long do we keep the data?**
After 12 months, or when you leave, we replace your name on the cards with a pseudonym. The record of the change stays. We delete your collection when you leave; you can download it first.

**How will we try it?**
We start with a trial of at least 10 weeks in [team]. We judge it with an anonymous survey on ownership and care, and with team figures on rework and failed changes. The number of cards does not count. A team can always switch the feature off. After the trial we discuss the results with you before rolling it out further.

**What we ask of you**
We ask for your consent to this arrangement, if possible within [number] weeks. We are happy to explain the proposal in a consultation meeting. You can also ask questions or propose changes. Attachments: the visibility overview, the "not for appraisal" agreement and the DPIA.

Kind regards,
[name, role]

## DPIA outline

A DPIA under GDPR article 35(7) needs at least the first four parts below; the fifth records the decision. The AP's [DPIA page](https://www.autoriteitpersoonsgegevens.nl/nl/zelf-doen/data-protection-impact-assessment-dpia) and the European DPIA guidelines ([WP248](https://www.dataguidance.com/sites/default/files/20171013_wp248_rev_01_en_d7d5a266-fae9-3ca1-65b7371e82ee1891_47711.pdf)) give more detail.

**1. Description of the processing.**

* Which Run Card features are switched on, built or proposed, with their state on the day of the DPIA.
* The data inventory above, trimmed to what is switched on.
* Data flows: forge and tracker to Ploeg, Ploeg to Unfold, and any client view. Where Unfold runs (self-hosted or hosted, and in which country), who administers it, and which processors are involved.
* Who can see what: the visibility matrix above, and who can change the configuration.
* Retention and pseudonymisation as configured.

**2. Purposes and legal basis.**

* The purposes and non-purposes above.
* The legitimate interest balancing test: the interest, why the processing is necessary, why a lighter alternative (team-only cards with no names) is not enough, and the effect on employees.
* The works council consent and its date, or why none is needed.

**3. Necessity and proportionality.**

* Data minimisation: which person-linked fields could be left out, and why each remaining one is needed.
* Subsidiarity: why the purpose cannot be met without naming people.
* Transparency: the staff notice and where it is published.
* Rights: how export, contest and objection work in practice.

**4. Risks to employees and measures.** For each risk, rate likelihood and severity before and after measures.

| Risk | Measures |
| --- | --- |
| Card data drifts into appraisal | The "not for appraisal" clause; no manager view of a Binder; no per-person totals; works council oversight |
| A wrong Crack harms someone's reputation | Human confirmation by two people; a dispute window and referee; contributing causes recorded; never totalled per person |
| Pressure to work outside hours | No streaks and no re-engagement notifications |
| Clients pressure named staff | Clients see team aggregates only |
| Long person-linked histories become de facto files | Pseudonymisation after 12 months and on leaving |
| Part-time staff or staff on leave look less productive | No per-person totals; no collection comparisons |
| Waiting or blocked time is read as one person's slowness | No actor stored with status moves; flow is shown per card only; the card contract says that waiting time reflects the process |
| Chilling effect on reporting faults | Credit for reporters and menders; a team page that explains that rising Cracks can mean a safer team |
| Configuration changed to add person-level views | Change control on configuration; such a change needs a new DPIA and works council consent |

**5. Sign-off.** The data protection officer's advice, the decision, and a review date (proposed: after the trial, then yearly, and whenever a feature is switched on).

## EU AI Act

* **AI that evaluates people at work is high-risk.** Annex III point 4(b) of the AI Act lists AI systems intended "to monitor and evaluate the performance and behaviour of persons" in work relationships ([Annex III](https://artificialintelligenceact.eu/annex/3/)). A system that profiles natural persons is always high-risk ([article 6](https://artificialintelligenceact.eu/article/6/)). A deploying employer must inform workers' representatives and affected workers beforehand ([article 26](https://artificialintelligenceact.eu/article/26/)).
* **Run Cards grade changes, not people.** The proposed Grade is a published, versioned formula over recorded facts about one change, shown on that change. No AI-derived score attaches to a person, and no card data is rolled up per person or used to assign work. That design keeps Run Cards out of Annex III point 4(b). An employer that adds person-level totals, or uses card data to allocate work, would change that.
* **Timing.** The high-risk obligations were reported to move to 2 December 2027 by the Digital Omnibus ([Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)). Check the Official Journal.

## Before you rely on this pack

Review these points with counsel:

* whether your CAO already regulates monitoring, which would change the consent route (WOR article 27(3));
* whether a PVT or no representation applies at your size, and what you owe staff directly in that case;
* the wording of the balancing test and the staff notice;
* whether your retention settings meet storage limitation for your situation;
* whether client-facing views count as sharing employee data with a third party in your contracts;
* the current state of the AI Act timing and of any Dutch guidance on employee monitoring.

> **Not legal advice.** Have your counsel, data protection officer and works council review this pack before use.
