# Run cards: gamification evidence, ownership and Dutch and EU law

Status: research record, 2026-10-01. It informs the proposed [Run cards](../concepts/run-cards.md) and the [works council and DPIA pack](../reference/run-cards-works-council-pack.md). It is not current guidance and **not legal advice**: the legal section summarises primary texts and regulator guidance so that an owner can brief a lawyer and a works council (*ondernemingsraad*, OR).

**Question.** Will a collectible card per delivered change, signed by a developer, that levels up while the code survives, cracks when a bug is traced to it and is mended by a fix, create ownership and care? And what keeps it lawful for a self-hosted product later sold to Dutch and EU agencies?

**Method.** Desk review of systematic reviews and field studies of gamification in software engineering, motivation research, engineering-metrics frameworks, safety and blame research, and the GDPR, the Dutch Works Councils Act (WOR) and the EU AI Act with regulator guidance.

**Limitations.** No controlled study tests collectible-card or kintsugi framing in software teams. Little evidence covers gamification of work an AI agent produced. Most positive results are short-term, educational or self-reported; the industrial ones are team-level or survey-based. The AI Act timing below must be checked against the Official Journal. The brief was written while the product was called Glide.

## Bottom line

1. **A card is defensible only as a record of a change, not as a score of a person.** Gamification measurably steers developer behaviour, including in unwanted directions. Rewards tied to performance crowd out intrinsic motivation and raise quantity rather than quality. Per-person metrics get gamed and leak into appraisals. In the Netherlands a system *suitable for* observing employee performance needs works council consent and, at scale, a DPIA.
2. **Ownership helps quality; blame hurts learning.** Clear component ownership goes with fewer defects. Blame cultures suppress the error reporting the crack mechanic depends on. Bug-to-change attribution is unreliable: the best SZZ-family algorithms get at most 63 % right, and 9 to 21 % of bugs have no introducing commit.
3. **Signing an AI-written pull request risks a moral crumple zone.** A signature should attest to what the reviewer checked, not guarantee the agent's work.
4. **Mending fits the research, indirectly.** Blameless postmortems, "intelligent failure" and generative culture all support celebrating repair. Kintsugi framing itself is untested: a hypothesis to evaluate.
5. **The product can stay out of trouble** with team-level defaults, no ranking, a private personal view, a change-centred data model, contestable attribution, short retention of person links, a works-council pack and no person-level AI grading.

## Gamification in software and knowledge work

### Reviews: many studies, little causal evidence

| Review | Finding |
| --- | --- |
| [Pedreira 2015](https://www.semanticscholar.org/paper/Gamification-in-software-engineering-A-systematic-Pedreira-Garc%C3%ADa/c605abdfc50787818fce169198e0807c5b474c1c), 29 studies | Mostly points and badges; a "lack of empirical evidence of the impact" |
| [Porto 2020](https://arxiv.org/abs/2011.07115), 103 papers | Points and leaderboards most common; "empirical evidence is very limited" |
| [Hamari 2014](https://www.semanticscholar.org/paper/Does-Gamification-Work-A-Literature-Review-of-on-Hamari-Koivisto/0768149ce1170691bcde8b4539153a282f0cc74c), 24 papers | Mostly positive, "depending greatly on the context and users" |
| [Koivisto & Hamari 2019](https://researchportal.tuni.fi/en/publications/the-rise-of-motivational-information-systems-a-review-of-gamifica/), 819 studies | Leans positive, but "the amount of mixed results is remarkable"; novelty effects common |
| [Toda 2018](https://link.springer.com/chapter/10.1007/978-3-319-97934-2_9) | Negative effects: indifference, loss of performance, undesired behaviour, declining effects |
| [Almeida 2023](https://arxiv.org/abs/2305.08346), 87 papers | Badges, leaderboards, competition and points cause the most harm, including gaming and cheating |

Gamification reliably moves engagement and activity. Evidence that it improves quality in software work is thin, and the documented harms come from the elements a card design leans on.

### Field evidence with developers

* **GitHub streaks.** GitHub removed the counter in 2016 to focus "on the work you're doing rather than the duration" ([GitHub 2016 blog](https://github.blog/news-insights/product-news/more-contributions-on-your-profile/)). Across 433,138 developers, long streaks were abandoned, weekend activity dropped, token single-contribution days became rarer, and streaks of 14+ days passing 100 days fell from 4.4 to 2.0 % ([Moldon 2021](https://arxiv.org/abs/2006.02371)). **Any time-based counter changes when people work, including at weekends.**
* **Stack Overflow badges** spike the targeted action just before the badge and fall back after ([Anderson 2013](https://www.cs.cornell.edu/home/kleinber/www13-badges.pdf), [ACM](https://dl.acm.org/doi/10.1145/2488388.2488398)); the effect varies by user type ([Yanovsky 2021](https://asistdl.onlinelibrary.wiley.com/doi/10.1002/asi.24409)).
* **GitHub Achievements** ("YOLO", "Pull Shark") drew objections that they trivialised work and branded people ([changelog](https://github.blog/changelog/2022-06-09-achievements-public-beta/), [GitHub Achievements discussion](https://github.com/orgs/community/discussions/18204), [#28161](https://github.com/orgs/community/discussions/28161)). GitHub added an opt-out.
* **Hacktoberfest 2020:** a T-shirt for four pull requests produced spam, and the event became opt-in with maintainer-accepted pull requests only ([Hacktoberfest 2020](https://www.digitalocean.com/blog/announcing-hacktoberfest-2020), [InfoQ](https://www.infoq.com/news/2020/10/hacked-off-hacktoberfest/)).
* **Team-level DevOps badges** at a large company raised practice adoption by 60 % to 6×, with mixed delivery effects; 73 % of developers found them useful as *information*. Teams also grew "nervous about doing things which would cause them to lose a badge" ([Ayoup 2022](https://arxiv.org/abs/2208.05860), [ACM](https://dl.acm.org/doi/10.1145/3540250.3558948)). That quote is about cracking.
* **Gamified code review** made comments look more useful but took longer and found no more bugs ([Khandelwal 2017](https://www.semanticscholar.org/paper/Impact-of-Gamification-on-Code-review-process:-An-Khandelwal-Sripada/3211743bd23e9cbb3eac35b53e31ff303d992f1b)). Gamification relates to job satisfaction only through engagement in the work ([Stol 2022](https://link.springer.com/article/10.1007/s10664-021-10062-w)).
* **Voluntary, playful games outside evaluation worked:** Microsoft's Language Quality Game ([Microsoft productivity games](https://blogs.microsoft.com/ai/microsofts-ross-smith-asks-shall-we-play-a-game/), [Game Developer](https://www.gamedeveloper.com/business/serious-play-conference-2011-microsoft-s-productivity-games-)) and Google's team-level Test Certified ladder ([Google Test Certified](https://martinfowler.com/articles/testing-culture.html)).

### Elements and consent

* Points, levels and leaderboards raised the *amount* of work, not competence or intrinsic motivation ([Mekler 2017](https://research.aalto.fi/en/publications/towards-understanding-the-effects-of-individual-gamification-elem/)). Badges and a leaderboard lowered motivation and exam scores over 16 weeks ([Hanus & Fox 2015](https://www.sciencedirect.com/science/article/abs/pii/S0360131514002000)).
* **Novelty fades** after about four weeks and partly recovers at six to ten ([Rodrigues 2022](https://educationaltechnologyjournal.springeropen.com/articles/10.1186/s41239-021-00314-6)). A trial must run longer than ten weeks.
* **Consent decides the sign.** Salespeople who accepted a leaderboard game felt better; those who did not felt worse and performed somewhat worse ([Mollick & Rothbard](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2277103)).

## Motivation: when rewards help and when they harm

* **Self-determination theory:** autonomy, competence and relatedness predict quality and well-being at work ([Deci, Olafsen & Ryan 2017](https://www.annualreviews.org/content/journals/10.1146/annurev-orgpsych-032516-113108)).
* **Overjustification:** an *expected* reward lowered later interest; an unexpected one did not ([Lepper 1973](https://www.heartofcharacter.org/wp-content/uploads/Undermining_Childrens_Intrinsic_Interest_with_Ext-1.pdf)).
* **128 experiments:** expected tangible rewards undermined intrinsic motivation (d ≈ −0.28 to −0.40); *informational* positive feedback enhanced it (d ≈ +0.33), *controlling* feedback did not ([Deci, Koestner & Ryan 1999](https://home.ubalt.edu/tmitch/642/articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf); disputed in parts, [Eisenberger comment](https://pubmed.ncbi.nlm.nih.gov/10589298)).
* **Incentives predict quantity; intrinsic motivation predicts quality** (k = 183, N = 212,468) ([Cerasoli 2014](https://selfdeterminationtheory.org/wp-content/uploads/2017/06/2014_Cerasoli_Intrinsic.pdf)). Review and production quality need the quality channel.
* **Goodhart and Campbell:** a measure under pressure collapses and corrupts the process it monitors ([Campbell 1979](https://www.ojp.gov/ncjrs/virtual-library/abstracts/assessing-impact-planned-social-change), [Goodhart/Strathern review](https://pmc.ncbi.nlm.nih.gov/articles/PMC7901608/)).
* **Endowment and loss aversion:** owners value what they hold at about twice its price ([Kahneman 1990](https://econpapers.repec.org/RePEc:ucp:jpolec:v:98:y:1990:i:6:p:1325-48)). A crack on "your" card is designed to sting; expect disputes and under-reporting.
* **Psychological ownership has a dark side:** territoriality ([Psychological ownership briefing](https://www.sbs.ox.ac.uk/sites/default/files/2018-06/psychological_ownership_effects_and_applications_mib_briefing_no_2_hf281016.pdf)). A card that levels up while your code survives rewards keeping others out.
* **The IKEA effect needs labour and completion** ([IKEA effect](https://dash.harvard.edu/entities/publication/73120378-ce76-6bd4-e053-0100007fdf3b)). In Unfold the agent did the labour; ownership stays thin unless the steward shaped the Work Item, steered the Run and reviewed substantively.

**Cosmetic rewards help** when they are unexpected, informational, self-chosen, not exchangeable, not compared between people and consented to. **They harm** when expected and contingent on output, ranked, visible to people with power over you, removable as punishment or tied to pay.

## Engineering metrics frameworks

* **DORA's five metrics** (lead time, deployment frequency, recovery time, change fail rate, rework rate) apply at application or service level, to improve a team over time, "not to compete" ([DORA metrics guide](https://dora.dev/guides/dora-metrics/), [DORA history](https://dora.dev/insights/dora-metrics-history/)). Generative culture predicts performance ([DORA generative culture](https://dora.dev/capabilities/generative-organizational-culture/)).
* **DORA 2024:** more AI adoption went with lower throughput and stability, likely from larger batches ([DORA 2024](https://research.google/pubs/dora-accelerate-state-of-devops-2024-report/)). Show size as a cost to review, not an achievement.
* **SPACE** ([SPACE](https://dl.acm.org/doi/10.1145/3453928), [PDF mirror](https://people.uncw.edu/vetterr/classes/csc550-spring2023/The%20SPACE%20of%20Developer%20Productivity.pdf)): activity metrics "should never be used in isolation either to reward or to penalize developers"; report "only anonymized, aggregate results at the team or group level. (In some countries, reporting on individual productivity isn't legal.)"; developers can opt in to individual analyses. Long normalisation windows bias against leave and, by the same logic, part-time work, which is common in the Netherlands.
* **DevEx:** feedback loops, cognitive load and flow ([DevEx](https://dl.acm.org/doi/10.1145/3610285)). A card that shortens the loop from production back to the approver fits; one that adds social-evaluation load does not.
* **The McKinsey controversy:** measuring effort and output invites gaming. At Facebook, survey scores drifted into performance reviews until managers negotiated scores with engineers ([Orosz & Beck pt 1](https://newsletter.pragmaticengineer.com/p/measuring-developer-productivity), [pt 2](https://newsletter.pragmaticengineer.com/p/measuring-developer-productivity-part-2), [Beck's newsletter](https://newsletter.kentbeck.com/p/measuring-developer-productivity)). A manager view of collections would follow the same path.
* **Lines of code** reward bloat and punish deletion ([−2000 LoC](https://www.folklore.org/Negative_2000_Lines_Of_Code.html)).

## Blame, safety and repair

* **Psychological safety** predicts learning ([Edmondson 1999](https://eric.ed.gov/?id=EJ589456)); better-led teams *report more* errors ([Edmondson 1996](https://www.researchgate.net/publication/250959492_Learning_from_Mistakes_Is_Easier_Said_Than_Done_Group_and_Organizational_Influences_on_the_Detection_and_Correction_of_Human_Error)). **If culture improves, cracks will rise.** Project Aristotle found the same (industry study) ([Project Aristotle summary](https://www.leaderfactor.com/learn/project-aristotle-psychological-safety/)).
* **Blameless postmortems** seek contributing causes "without indicting any individual or team"; blame sweeps issues "under the rug" ([Google SRE postmortems](https://sre.google/sre-book/postmortem-culture/)). An engineer who expects reprimand withholds the details needed ([Allspaw 2012](https://www.etsy.com/codeascraft/blameless-postmortems), [mirror](https://jaytaylor.com/notes/node/1498058768000.html)).
* **Westrum:** generative cultures meet failure with inquiry. "Cracks your card" reads as justice; "this change needs mending, here is the inquiry" reads as generative.
* **Learning from failure** needs small failures and reframing ([Sitkin 1992](https://scholars.duke.edu/publication/913886), [Cannon & Edmondson 2005](https://www.hbs.edu/faculty/Pages/item.aspx?num=19331)). Good recovery can raise satisfaction above no failure at all ([Service recovery paradox](https://www.semanticscholar.org/paper/Service-Recovery-Paradox:-A-Meta-Analysis-Matos-Henrique/9fe45641aa68dd85871b872fe2f2970a8f6b6e26)).
* **Ownership improves quality** at component level (Bird et al., *Don't Touch My Code!*, ESEC/FSE 2011). It says nothing for punishing individuals per bug.
* **Attribution is unreliable:** 9 to 21 % of bugs have no introducing commit, and SZZ reaches at most 63 % true positives ([How bugs are born](https://pure.tudelft.nl/ws/portalfiles/portal/70175683/Rodr_guez_P_rez2020_Article_HowBugsAreBornAModelToIdentify.pdf)). A wrongly cracked signed card is a fairness incident.
* **The moral crumple zone:** responsibility lands on the human with least control over an automated system ([Elish 2019](https://estsjournal.org/index.php/ests/article/download/260/177/)), worsened by automation bias ([Parasuraman & Manzey 2010](https://www.semanticscholar.org/paper/Complacency-and-Bias-in-Human-Use-of-Automation:-An-Parasuraman-Manzey/b0e5a85803bb959ed2cbd47c51009cc48059c02c)).
* **Observation can reduce good behaviour:** shielding a line from managers raised productivity 10 to 15 % ([Bernstein 2012](https://www.hbs.edu/faculty/Pages/item.aspx?num=43639)).

## Law: GDPR, WOR and the AI Act

### GDPR

* **Consent is almost never valid from employees** ([EDPB consent guidelines](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf)). Legitimate interest needs strict necessity, proportionality, subsidiarity and effective information ([WP29 Opinion 2/2017](https://collab.dpa.gr/wp-content/uploads/2023/07/WP29_Opinion-2-2017-on-data-processing-at-work.pdf)). An opt-in personal view is a motivational safeguard, not a legal basis.
* **Art. 88** allows national rules on monitoring at work ([Art. 88](https://gdpr-info.eu/art-88-gdpr/)); the Netherlands relies mainly on the GDPR, its implementation act (UAVG) and the WOR.
* **Profiling** covers evaluating "performance at work… reliability, behaviour" ([GDPR Art. 4](https://gdpr-info.eu/art-4-gdpr/)). A per-person aggregate of grades and cracks is profiling.
* **DPIA.** Meeting two of WP248's nine criteria usually requires one ([WP248 DPIA](https://www.dataguidance.com/sites/default/files/20171013_wp248_rev_01_en_d7d5a266-fae9-3ca1-65b7371e82ee1891_47711.pdf), [Art. 35](https://gdpr-info.eu/art-35-gdpr/)). Person-linked cards hit evaluation, systematic monitoring and vulnerable data subjects. The Dutch Data Protection Authority (Autoriteit Persoonsgegevens, AP) lists "controle werknemers" as DPIA-mandatory and requires works council approval for a staff tracking system ([AP Controle van werknemers](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/werk-uitkering/controle-van-personeel), [AP DPIA](https://www.autoriteitpersoonsgegevens.nl/nl/zelf-doen/data-protection-impact-assessment-dpia), [AP OR-privacyboekje](https://www.autoriteitpersoonsgegevens.nl/uploads/imported/ap_or_privacy-boekje.pdf)).
* **Art. 5** minimisation, purpose limitation and storage limitation apply to retention.

### WOR

* **Art. 27(1)(l)** gives the OR a consent right over arrangements for facilities "gericht op **of geschikt voor**" observing attendance, behaviour or performance ([WOR](https://wetten.overheid.nl/BWBR0002747/)). *Suitable for* means intent does not matter. **Art. 27(1)(k)** covers rules on processing staff personal data.
* **Art. 27(5):** a decision without consent is void if the OR invokes that within one month. **Art. 27(3):** no consent right where a collective labour agreement (CAO) already regulates the matter.
* **Thresholds:** an OR is mandatory from 50 employees; from 10 to 49, staff can ask for a lighter staff representation (PVT) with narrower rights ([Arbeidsrechter.nl](https://www.arbeidsrechter.nl/verplichte-instelling-ondernemingsraad-ontheffing-50-werknemers/)). The GDPR applies regardless of size.

### EU AI Act

* **Annex III point 4(b)** makes high-risk any AI system intended "to monitor and evaluate the performance and behaviour of persons" in work relationships ([AI Act Annex III](https://artificialintelligenceact.eu/annex/3/)). A system that profiles natural persons is **always** high-risk ([Art. 6](https://artificialintelligenceact.eu/article/6/)). Deploying employers must inform workers' representatives first ([Art. 26](https://artificialintelligenceact.eu/article/26/)).
* **Timing:** the Digital Omnibus reportedly moved Annex III obligations to 2 December 2027 ([Omnibus (Gibson Dunn)](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/), [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)). Verify against the Official Journal.
* **For Unfold:** a grade of the *change*, shown on the change, is plausibly outside Annex III. The same grade rolled up onto a *person*, or used to assign work by track record, would make Unfold a high-risk provider and agencies high-risk deployers. That alone justifies never computing person-level AI scores.

### Design choices and their legal effect

| Design choice | Effect |
| --- | --- |
| Data keyed to the change; the person appears only as steward | Most card data stops being an evaluation of a person |
| No per-person aggregates in manager or client views | Avoids profiling and the AI Act trigger; weakens, but does not remove, the WOR case |
| Personal collection visible only to its owner | Matches SPACE opt-in and AP necessity |
| Person link pseudonymised after N months or on leaving | Storage limitation |
| A works-council and DPIA pack | Cheap legal path for customers; a sales asset for agencies |
| Data-subject export and a contest flow for attributions | Rights and fairness |

## Agency context

* **Showing the work raises perceived value** ([Buell & Norton 2011](https://www.hbs.edu/ris/Publication%20Files/Norton_Michael_The%20labor%20illusion%20How%20operational_f4269b70-3732-4fc4-8113-72d0c47533e0.pdf)). Change-level cards are a strong client artefact.
* **Naming individuals to clients is a new processing purpose** and invites pressure on named staff. Default client views to the team.
* **Cost belongs to the change.** Rolling cost up per person is misattribution and a Goodhart magnet.
* **Clients see mend status and time to mend** at project level, never per-person crack history.

## Verdict per mechanic

| Mechanic | Keep it if… |
| --- | --- |
| Sign | The signature records what was checked, and the card credits agent, Role and process |
| Level up while code survives | Levelling is cosmetic and about the change; a deliberate replacement retires the card with honours |
| Crack on a traced bug | Cracks are human-confirmed, contestable, show contributing causes, are never totalled per person, and have a visible mend path |
| Mend | Anyone can mend; mender and reporter get credit; a mended card looks more distinguished, never worse |
| Cost | Never aggregated per person |
| Lines of code | Shown as review load; net deletions celebrated |
| Grade | It grades the change against explicit criteria and never rolls up to a person |
| Days in production | A fact, never a streak; no weekend nudges |
| Rarity | It comes from unexpected, meaningful events, with no trading, prizes or pay link |

## Twenty guardrails

1. The card belongs to the change; the person is its steward.
2. Never rank people: no leaderboards, no per-person totals in any shared view.
3. Team or service level is the default for every aggregate.
4. The personal collection is private by default and shared card by card.
5. No manager view of an individual's collection, and a written "not for appraisal" clause.
6. A signature attests to what the reviewer checked, not to the agent's correctness.
7. A crack is an inquiry, not a verdict: human-confirmed, contestable, with contributing causes.
8. Mending is celebrated more visibly than untouched survival.
9. Reward finding and reporting, never the absence of cracks.
10. Deletion and replacement are honourable endings.
11. No streaks, time-pressure counters or weekend nudges.
12. Lines of code are review load, never power.
13. Cost is change metadata, never a person metric.
14. Grades describe the change; no AI-derived score attaches to a person.
15. Rarity comes from surprise and meaning, not targets; nothing is tradeable or linked to pay.
16. Clients see team stewardship, cost and mend status, not named individuals' histories.
17. Short retention for the person link: pseudonymise after a configurable period (proposed 12 months) and on leaving.
18. Ship a works-council and DPIA pack with the product.
19. Evaluate over more than ten weeks with perceptual and team outcomes, never card counts, and let teams switch cards off.
20. Say what the card is not, and label proposed behaviour as proposed.

## Risks to be direct about

* Even with every guardrail, some developers will feel a crack on a signed card as public blame. If a trial shows lower reporting, or disputes taking over triage, drop person-level ownership and keep team stewardship.
* AI-written code weakens psychological ownership; give stewards real control over Work Item definition and Run steering.
* Customers will ask for leaderboards. Saying no is a product position; record it before the first enterprise request.
* One manager-facing "steward stats" screen could make customers' deployments consent-required, DPIA-mandatory and, if AI-graded, high-risk.
