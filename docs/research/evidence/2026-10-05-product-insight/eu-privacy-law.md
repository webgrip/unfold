<!-- Raw report of one research agent, 2026-10-05. Agent output, not verified line by line; the dossier cites what it relies on. -->

RESEARCH REPORT: UX telemetry, session replay and employee monitoring for Unfold (EU/NL), as of 2026-10-05. This collects what regulators, statutes and courts say. It is not legal advice.

## 1. ePrivacy / Telecommunicatiewet art. 11.7a

**F1.1 Dutch statute text (in force since 15-08-2026, read on wetten.overheid.nl).** https://wetten.overheid.nl/jci1.3:c:BWBR0009950&hoofdstuk=11&artikel=11.7a
- Lid 1: storing or reading information in a user's terminal equipment needs clear information plus consent.
- Lid 3(b) gives two exemptions:
  - access that is "strikt noodzakelijk" (strictly necessary) for a service the user requested;
  - access "mits dit geen of geringe gevolgen heeft voor de persoonlijke levenssfeer … om informatie te verkrijgen over de kwaliteit of effectiviteit van een geleverde dienst van de informatiemaatschappij". In plain terms: measuring the quality or effectiveness of the service is exempt if the privacy impact is nil or minor. This is the Dutch analytics exemption, written into the statute itself.
- Lid 4: collecting or combining data across different services in order to treat the user differently is presumed to be processing of personal data.
- There is no B2B, intranet or logged-in carve-out. The rule protects "gebruiker" (user) equipment, so it covers agency employees on their own laptops.

**F1.2 AP consumer page "Cookies" (updated 30 May 2025).** https://autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/cookies
- AP recognises three types of cookie: functional, "beperkt analytische" (limited analytics) and "overige" (other).
- Limited analytics cookies with "geen of geringe gevolgen" for privacy need no consent (citing art. 11.7a). If they process personal data, the owner still needs a GDPR legal basis and must list them in the privacy statement.

**F1.3 AP page for organisations (updated 10 April 2025).** https://autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/cookies/cookies-en-uw-organisatie-zorg-voor-een-goed-beleid
- Only functional cookies, or limited analytics cookies with nil or minor privacy impact, may be placed without consent.
- AP names privacy-friendly alternatives "mits goed ingesteld" (if configured properly): **Matomo, Apache Superset, Plausible Analytics, OpenPanel**.
- A DPIA is required for cookies likely to carry high privacy risk.

**F1.4 AP ambtsbericht (official letter), 14 Dec 2023, footnote 2.** https://www.autoriteitpersoonsgegevens.nl/uploads/2023-12/20231214%20AP%20ambtsbericht%20-%20Kamervragen%20cookies%20en%20online%20tracking.pdf
- Functional and non-privacy-sensitive analytics cookies need no consent under 11.7a.
- GDPR consent may still be needed "tenzij er al een andere grondslag … (zoals gerechtvaardigd belang …)", i.e. unless another legal basis such as legitimate interest applies.
- One secondary source (lawsy.nl) claims "since April 2025 limited analytics fall under legitimate interest and the AP amended the Telecommunicatiewet". This is **NOT SUPPORTED**: the AP cannot amend statutes, and the statute text is as quoted in F1.1.
- AP's older detailed Google Analytics conditions (IP masking, data sharing off, processor agreement) were not re-fetched: **UNVERIFIED** in their current form.

**F1.5 EDPB Guidelines 2/2023 on the technical scope of Art. 5(3) ePD, v2 adopted 7 Oct 2024.** https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
- The rule covers "information", not only personal data.
- §33: JavaScript where "the accessing entity instructs the browser … to send asynchronous requests with the targeted information … clearly falls within the scope". That covers a JS event SDK.
- §44: cookies, local storage and WebSQL used only inside the device are not "access", "but when this information or any derivation … is accessed, Article 5(3) ePD would apply".
- §47–51: tracking pixels and tracking URLs are in scope. For dynamically built pixels, distributing the JS is the instruction.
- §52–53: results computed locally and then sent to a server are in scope.
- Conclusion: going "cookieless" does not take JS event tracking out of 5(3). Only an exemption does (F1.1, F1.6).

**F1.6 CNIL audience-measurement exemption (page updated 4 July 2025).** https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience
- Allowed purposes: strictly audience measurement, including "détection de problèmes de navigation, optimisation … de son ergonomie" (finding navigation problems, improving ergonomics). Exclusively for the publisher's own account. Anonymous statistics only.
- Not allowed: cross-referencing with other processing, passing non-anonymous data to third parties, cross-site tracking, or a shared identifier across sites.
- Recommended: tracker lifetime of 13 months with no automatic extension; data retention of at most 25 months; users informed.
- Vendors whose providers reuse the data for their own purposes fall outside the exemption. Watch for transfers outside the EU.
- **The current CNIL page publishes no list of exempt tools.** Since 2025 vendors self-assess with a CNIL tool (https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf) and may not claim "certified by CNIL".
- A secondary claim lists Wysistat, Piano Analytics, SmartProfile, Piwik PRO and Abla as of 31 Mar 2025: **UNVERIFIED** against CNIL. Old CNIL-hosted configuration guides still exist for etracker and Piwik PRO: https://www.cnil.fr/sites/cnil/files/atoms/files/etracker_-_guide_de_configuration_solution_de_mesure_daudience_exemptee.pdf

**F1.7 WP29 Opinion 04/2012 on the cookie consent exemption (WP194).** https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf
- The "strictly necessary" exemption applies to a functionality "explicitly requested by the user" (e.g. "user-input" cookies).
- INFERENCE, not a regulator statement: a bug report the user starts by clicking a button may fit this exemption. Background capture does not.

**F1.8 Proposed reform, not law.** EDPB-EDPS Joint Opinion 2/2026 on the Digital Omnibus: https://www.edpb.europa.eu/system/files/documents/2026-02/edpb_edps_jointopinion_202602_digitalomnibus_en.pdf
- The proposed GDPR Art. 88a would allow terminal access without consent for a controller's own aggregated audience measurement.
- Secondary sources say it was still in trilogue (negotiation between Council and Parliament) as of September 2026: **UNVERIFIED** (https://secureprivacy.ai/blog/eu-digital-omnibus-what-article-88a-changes-for-cookie-consent-2026). Treat as proposed.

## 2. Session replay, heatmaps, frustration signals

**F2.1 CNIL draft recommendation on session replay ("rejeu de session"), published 25 Feb 2026, consultation closed 22 Apr 2026.** https://www.cnil.fr/en/session-replay-cnil-launches-public-consultation-its-draft-recommendation | draft PDF: https://www.cnil.fr/sites/default/files/2026-02/projet_de_recommandation_rejeu_session.pdf
- I found **no adopted final version** as of 2026-10-05.
- §19: replay is neither exclusively for communication nor strictly necessary, so **prior consent is required**. Consent can be collected through the existing consent banner (CMP), purpose by purpose. §29: consent is "généralement la base légale la plus appropriée" (generally the most appropriate GDPR basis).
- §42, collection limits:
  - L1: random sampling;
  - L2: record everything but delete quickly unless a trigger event occurs;
  - L3: analyse, then delete sessions that are not needed.
- §43, masking. The vendor must supply automatic and manual masking of images, forms, text fields and dynamic fields. **With no configuration, mask all categories by default (M0).** The options are:
  - M1: collect, but unmasking needs an authorised user plus internal approval;
  - M2: collect, encrypted out of the publisher's reach;
  - M3: do not collect.
- §44, identifiers: I1 random short-lived session id; I2 hashed pseudonymous id; I3 domain-limited id.
- §48, security: S1 block passwords, payment and other sensitive data; S2 role-based access with periodic review. Most protective defaults apply under Art. 25 GDPR.

Annex table (CNIL's recommended measures per purpose):

| Purpose | Measures | Retention | Note |
|---|---|---|---|
| UX friction (rage/false clicks) | (L1 or L3) + (M2 or M3) + I1 + S1 + S2 | "quelques mois" (a few months) | no user-id link |
| Error detection | (L2 or L3) + (M1, M2 or M3) + I1 + S1 + S2 | a few months | no user-id link |
| Support | L2 + M1–3 + (I2 or I3) + S1 + S2 | "quelques heures" after the session ends | user validation before any unmasking |

- The draft does not mention DPIA or employees (grep for AIPD and salarié: absent).

**F2.2 No DPA fine found that targets session replay as such (Hotjar, Clarity, FullStory etc.).**
- Searches of DPA and enforcement sources found nothing.
- CNIL's sanctions list: https://cnil.fr/fr/les-sanctions-prononcees-par-la-cnil (not exhaustively checked).

**F2.3 Microsoft Clarity's own FAQ (ms.date 2026-09-08).** https://learn.microsoft.com/en-us/clarity/faq
- Data is stored in Azure. EU customers contract with Microsoft Ireland, which uses SCCs with Microsoft Corp (US).
- "Microsoft/Clarity has access to the data". Retention is 30 days.
- Clarity **enforces explicit consent signals for EEA/UK/CH visitors**. Without consent, replays are fragmented.
- Input boxes are masked in every mode. CSS is not masked.
- Third-party cookies are used "to support operational purposes like advertising".
- Microsoft's own access to the data probably fails the CNIL "own account only" condition (F1.6). This is my inference.

**F2.4 US contrast: *Popa v. Microsoft*, 9th Cir., 26 Aug 2025.** https://law.justia.com/cases/federal/appellate-courts/ca9/24-14/24-14-2025-08-26.html
- A Clarity session-replay class action was dismissed for lack of Article III standing (no concrete harm).
- Other California Invasion of Privacy Act (CIPA) wiretap suits continue. They are irrelevant to EU law except as a reputational signal.

**F2.5 DPIA.** AP mandatory DPIA list, Staatscourant 2019-64418: https://zoek.officielebekendmakingen.nl/stcrt-2019-64418.html
- Item 11 "Controle werknemers": "Grootschalige verwerking … en-of stelselmatig monitoring van activiteiten van werknemers (bijvoorbeeld controle van e-mail en internetgebruik …)", i.e. large-scale or systematic monitoring of employee activity.
- Item 15 "Profilering", including assessment of "beroepsprestaties … gedrag" (job performance, behaviour).
- Item 16 "Observatie en beïnvloeding van gedrag": large-scale systematic automated observation of behaviour.
- So employee monitoring and behaviour tracking are both on the list.

## 3. Employee monitoring (NL)

**F3.1 WOR (Works Councils Act) art. 27(1)(l), in force since 18-02-2023.** https://wetten.overheid.nl/jci1.3:c:BWBR0002747&artikel=27
- The works council (OR) has a consent right over any "regeling inzake voorzieningen die gericht zijn op **of geschikt zijn voor** waarneming van of controle op aanwezigheid, gedrag of prestaties". That means facilities aimed at, **or merely suitable for**, observing or checking attendance, behaviour or performance. Intent does not matter.
- 27(1)(k) covers personnel-data processing rules.
- 27(5): a decision taken without consent is **nietig** (void) if the OR invokes nullity in writing within one month.
- Thresholds:
  - An OR is mandatory from 50 staff (art. 2).
  - A personeelsvertegenwoordiging (PVT, staff representation for firms of 10–49) has **no** consent right on 27(1)(l) by default. Art. 35c(3)–(4) gives it only b (working hours), d and m.

**F3.2 AP "Voorwaarden voor controle werknemers" (updated 7 Feb 2025).** https://autoriteitpersoonsgegevens.nl/themas/werk-en-uitkering/controle-van-werknemers/voorwaarden-voor-controle-werknemers
- Examples of monitoring include "volgsoftware die registreert wat medewerkers op hun computer doen (… toetsaanslagen, gebruik van e-mail en internet)", i.e. software logging computer activity and keystrokes.
- Requirements:
  - a legal basis, usually legitimate interest;
  - consent is "niet goed te gebruiken" (not usable) because of the power imbalance;
  - necessity and the least intrusive means;
  - informing staff (what, why, when, how, which data), e.g. through a protocol;
  - **prior OR consent**; "Stemt de OR er niet mee in, dan mag u niet controleren" (if the OR does not consent, you may not monitor);
  - **a DPIA** for large-scale or systematic monitoring, with prior consultation of the AP if high residual risk remains.
- Hub page: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/werk-uitkering/controle-van-personeel

**F3.3 WP29 Opinion 2/2017 on data processing at work (WP249).**
- Consent is "highly unlikely" to be valid at work unless employees can refuse without adverse consequences. Legitimate interest requires necessity, proportionality and the least intrusive means.
- Secondary summaries: https://www.hunton.com/privacy-and-information-security-law/article-29-working-party-releases-opinion-on-data-processing-at-work. The primary PDF was not fetched this pass.

**F3.4 Enforcement contrast: CNIL vs Amazon France Logistique.**
- CNIL fined €32M on 27 Dec 2023 for intrusive productivity indicators: idle time, scans faster than 1.25 s, latency around breaks. https://edpb.europa.eu/news/national-news/2024/employee-monitoring-french-sa-fined-amazon-france-logistique-eu32-million_de
- The Conseil d'État reduced the fine to €15M on 23 Dec 2025, holding that three indicators were not GDPR violations. Source is secondary (https://www.usine-digitale.fr/cybersecurite/data-protection/cnil/surveillance-au-travail-le-conseil-detat-desavoue-la-cnil-et-reduit-de-moitie-lamende-infligee-a-amazon.QNXQPNDTJ5FHVGCABLZXUYY3FA.html). The primary decision is **UNVERIFIED**.
- Relevance: idle-time and "dead time" style frustration metrics tied to named employees are exactly what regulators examine.

**F3.5 Controller/processor.** EDPB Guidelines 07/2020, v2 adopted 7 July 2021, §81: https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf
- A processor "may not carry out processing for its own purpose(s)". Under Art. 28(10), a processor that determines its own purposes "will be considered a controller in respect of that processing".
- Dutch precedent on vendor telemetry: the SLM Rijk / Privacy Company DPIAs on Microsoft Office diagnostic data, about 25,000 event types, with Microsoft acting as controller. https://slmmicrosoftrijk.nl/wp-content/uploads/2019/04/DPIAMicrosoftOffice2016and365-20191105.pdf
- EDPS decision of 8 Mar 2024: the Commission's use of Microsoft 365 infringed purpose limitation because Microsoft's own-purpose collection was not limited. https://www.edps.europa.eu/press-publications/press-news/press-releases/2024/european-commissions-use-microsoft-365-infringes-data-protection-law-eu-institutions-and-bodies_en

## 4. International transfers (2026)

**F4.1 Latombe.**
- The General Court dismissed T-553/23 on 3 Sep 2025, so the DPF is valid at first instance. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023TO0553
- The appeal, **C-703/25 P**, was lodged 31 Oct 2025 and is pending. No hearing date was found. Microsoft was reportedly admitted as an intervener in June 2026: **UNVERIFIED**, from secondary sources (https://secureprivacy.ai/blog/is-the-eu-us-data-privacy-framework-at-risk-the-ftc-ruling-explained-2026, https://ieu-monitoring.com/editorial/microsoft-backs-eu-commission-in-eu-court-case-on-transatlantic-data-flows-and-privacy/1244467).

**F4.2 *Trump v. Slaughter*, SCOTUS, 29 June 2026.** https://www.supremecourt.gov/opinions/25pdf/25-332_qn12.pdf
- The President may remove FTC commissioners without cause.
- noyb (29 June 2026) says the DPF relied on FTC "independence" 259 times. It asks for an "orderly withdrawal" and announced a CJEU suit. https://noyb.eu/en/us-supreme-court-just-blew-eu-us-data-transfers. Whether that suit was filed: **UNVERIFIED**.
- The EDPB letter to Commissioner McGrath (31 July 2026) asks the Commission to "closely assess" the effect on Decision 2023/1795. https://www.edpb.europa.eu/documents/edpb-correspondence/edpb-letter-to-the-european-commission-on-us-supreme-court-judgment_en
- No withdrawal or suspension has been found. **The DPF remains legally in force** but is at elevated risk.
- Earlier, PCLOB (the US Privacy and Civil Liberties Oversight Board) lost its quorum on 27 Jan 2025. https://cdt.org/insights/what-the-pclob-firings-mean-for-the-eu-us-data-privacy-framework/

**F4.3 CLOUD Act.** EDPB-EDPS joint response, 10 July 2019, annex: https://www.edpb.europa.eu/sites/default/files/files/file2/edpb_edps_joint_response_us_cloudact_annex.pdf
- Under GDPR Art. 48, a US law-enforcement request "may only be recognised or made enforceable if based on an international agreement". A foreign order is not itself a transfer ground.
- On 10 June 2025, Microsoft France's Anton Carniaux told the French Senate under oath that he cannot guarantee EU data will never be handed to US authorities. Secondary source: https://www.theregister.com/2025/07/25/microsoft_admits_it_cannot_guarantee/. The Senate primary transcript was not fetched.
- So EU hosting by a US-owned company reduces transfer risk but does not remove CLOUD Act exposure.

**F4.4 Tools.**
- **Microsoft Clarity:** US Azure storage, SCCs, Microsoft access, consent enforced (F2.3).
- **Hotjar / Contentsquare:** Contentsquare is French. Sub-processor list v2026.4 (June 2026): EU customers' data is stored in the EU by default, on AWS eu-west-1 or eu-central-1, with Azure also listed. AWS and Azure are US parents, so CLOUD Act exposure applies. https://contentsquare.com/privacy-center/subprocessors/
- **PostHog:** EU Cloud is in Frankfurt (https://posthog.com/docs/privacy/data-storage). It also has a "cookieless server hash mode" that strips IP. PostHog Inc. being US-incorporated: **UNVERIFIED** this pass.

## 5. AI Act / Data Act / NIS2

**F5.1 AI Act.** Annex III 4(b): https://artificialintelligenceact.eu/annex/3/
- High-risk includes AI "to monitor and evaluate the performance and behaviour of persons in [work] relationships".
- The Digital Omnibus on AI moved the Annex III application date to **2 Dec 2027**: Regulation (EU) 2026/1744, in force 27 July 2026. Source is secondary: https://www.cyberlawwatch.com/2026/07/31/eu-digital-omnibus-on-ai-enters-into-force/. The OJ number is **UNVERIFIED** against EUR-Lex.
- Plain UX telemetry is **not** an AI system. It becomes relevant only if Unfold uses ML or LLMs to score individual staff from telemetry.
- Rage clicks are not "emotion recognition", which is based on biometrics. That is my inference.

**F5.2 Data Act (Reg. 2023/2854), applicable since 12 Sep 2025.** https://digital-strategy.ec.europa.eu/en/factpages/data-act-explained
- Chapter II (connected products) does not apply to web-app telemetry. Telemetry relevance: **none**.
- Chapter VI (cloud switching) **does apply to hosted SaaS in phase 2**: export in machine-readable formats and open interfaces; switching and egress charges banned from **12 Jan 2027**.

**F5.3 NIS2 / Cyberbeveiligingswet: in force 15 Aug 2026.** https://www.ncsc.nl/cyberbeveiligingswet-nis2 | law: https://wetten.overheid.nl/BWBR0052872/2026-08-15/0
- It concerns the vendor's security posture, not telemetry consent. Telemetry relevance: **none**.
- Whether a small hosted Unfold is in scope (cloud or managed service provider, size cap) was **not verified** against the law text this pass.

## 6. Privacy-first compliance pattern (regulator-sourced elements)

- First-party, self-hosted or EU-owned event collection. AP names Matomo, Plausible, OpenPanel and Superset (F1.3).
- Own-account-only processing, no vendor reuse, no cross-site ids (F1.6).
- 13-month identifier lifetime and 25-month data cap (F1.6). For replay, retention of a few months, or hours for support (F2.1).
- Pseudonymous or random ids: CNIL I1/I2 (F2.1).
- Mask everything by default (M0), block secrets (S1), role-gated unmasking (F2.1, M1/S2).
- Separate consent purpose for replay (F2.1). Trigger-based or sampled capture (L1–L3).
- Information in the privacy notice plus a legal basis even when ePrivacy-exempt (F1.2, F1.4).
- Employer side: legitimate interest (not consent), OR consent, DPIA, staff protocol (F3.1, F3.2).
- Vendor DPA must not reserve own-purpose use; otherwise the vendor is controller (F3.5).

## What this means for Unfold

**(a) Self-hosted installs (the agency is controller; the vendor receives nothing by default)**
1. Any analytics, replay or survey features are the customer's processing. Ship them **off by default**, as an admin-level tenant switch.
2. Document that a switched-on, per-user identifiable telemetry or replay feature is "geschikt voor" behaviour or performance monitoring. That triggers WOR 27(1)(l) OR consent at agencies with 50+ staff (F3.1) and a probable DPIA (F2.5, F3.2). Ship a DPIA and protocol template.
3. Any "phone home" usage ping to the vendor would make the vendor a controller or recipient (F3.5). It should be opt-in, aggregate and anonymous.
4. Masking defaults matter even here. Screens contain clients' source code, diffs and PR text, so mask by default per CNIL M0 (F2.1).

**(b) Hosted phase 2 (the agency is controller, Unfold is processor)**
1. Aggregate first-party product analytics (page or feature use, error rates, aggregate frustration counts):
   - It can plausibly rest on the 11.7a(3)(b) analytics exemption if it is own-account only, uses pseudonymous ids, is not combined with other data and has limited retention (F1.1, F1.2, F1.6).
   - It still needs a GDPR basis, likely legitimate interest, plus a notice (F1.4).
   - If Unfold wants this data for its own product improvement, the DPA must say so. For that slice Unfold is controller (F3.5). Prefer aggregation or anonymisation before it leaves the tenant.
2. Session replay is consent-only under CNIL's draft (F2.1). Employee consent is weak (F3.2, F3.3). The safest pattern is user-initiated, short-lived capture ("record this for a bug report"), with everything masked and retention measured in hours to weeks. Background replay needs a tenant-admin switch, OR consent and a DPIA on the agency side.
3. Event-triggered micro-surveys rely on JS plus storage (F1.5). Make them an optional, opt-out-able feature and do not link answers to performance evaluation.
4. A bug-report widget with screenshot and console log, started by the user, plausibly fits "explicitly requested by the user" (F1.7; my inference). Mask code panes and strip secrets from logs (S1).
5. Avoid Clarity: US storage, Microsoft's own access, consent enforcement (F2.3). Avoid US-owned SaaS tools where possible: the DPF is in force but under pressure (F4.1–F4.2), and the CLOUD Act applies even with EU hosting (F4.3). Prefer self-hosted or EU-owned tooling.
6. Data Act Chapter VI applies to the hosted service: export and switching terms now, no egress fees from 12 Jan 2027 (F5.2). Check Cbw scope separately (F5.3).
7. AI Act: do not build per-person scoring of agency staff from telemetry. That would move toward Annex III 4(b) high-risk, from 2 Dec 2027 (F5.1).

**(c) Unfold's own dogfood instance, used only by the owner**
1. The owner is the only user, so ePrivacy consent and the employee-monitoring issues effectively disappear: he consents by configuring it himself, there is no OR and no employment relationship. Retaining his own data is low-risk.
2. Remaining exposure: third-party personal data and client confidentiality on screen (names in tickets and PRs, client code). Keep masking on and retention short. Avoid shipping replays to a US vendor (F4.3).
3. This is the right place to prove the pattern before it becomes a product default: self-hosted collector, pseudonymous ids, masked replay, retention caps.

## Explicit absences
- No adopted final CNIL session-replay recommendation was found.
- No EU DPA fine specifically on session replay was found.
- No AP-specific guidance on session replay or heatmaps was found.
- No primary source for the C-703/25 P hearing date, the Microsoft intervention, or noyb's suit filing.
- No current official CNIL list of exempt tools.
