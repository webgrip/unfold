# Governance, regulation and assurance

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## AIUC-1 AI agent security, safety and reliability standard (certification) { #aiuc-1 }

Not to be confused with: A private, quarterly-revised agent certification standard with accredited auditors (e.g. Schellman). Not an SDO standard.

| | |
| --- | --- |
| Steward | AIUC (Artificial Intelligence Underwriting Company) (single-vendor) |
| Status | stabilising |
| Latest | [July 2026 (Q3) revision [secondary] 2026-07-15](https://drata.com/updates/aiuc-1-version-update-july-2026) |
| Radar | **assess**: Fit decided it: it is agent-specific and gaining buyers, but it is single-vendor, revised quarterly, and the hosted offering does not exist yet. |
| Moves when | Phase 2 is funded and a pilot Agency or its Client asks for AIUC-1 or an equivalent agent certification. |
| Competes with | [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001) |
| Complements | [OWASP Top 10 for Agentic Applications 2026 (with OWASP Top 10 for LLM Applications 2026 and Agent Control Standard)](security-supply-chain.md#owasp-agentic-top10) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [0105-a-credential-leak-parks-the-work-item-and-closes-its-pull-request](../../../../../apps/ploeg/docs/adrs/0105-a-credential-leak-parks-the-work-item-and-closes-its-pull-request.md), [0061-unfold-signs-the-audit-chain-head-with-openbao-transit-and-copies-it-to-a-locked-bucket-daily](../../../../../apps/unfold/docs/adrs/0061-unfold-signs-the-audit-chain-head-with-openbao-transit-and-copies-it-to-a-locked-bucket-daily.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Gap check of the hosted service | hosted Tenant | Proposed: run a self-assessment of the hosted Tenant service against the current quarterly AIUC-1 revision, using the public OWASP crosswalk. | M | Shows what an agent-specific audit would find before paying for one. |
| Evidence already held | Run evidence | Map existing evidence (budgets per Ploeg ADR-0012, credential leak parking per Ploeg ADR-0105, attack drill per Ploeg ADR-0126, signed audit chain per Unfold ADR-0061) to AIUC-1 controls. | S | Reuses facts Unfold already records. |
| Sales asset for Agencies | Agency contract | Proposed: consider certification only if pilot Agencies say it would help them sell agent-made work to their Clients. | L | A recognised trust mark for a hosted agent product. |
| Insurance link | Agency contract | Proposed: ask whether certification lowers an Agency's liability insurance cost for agent-made defects, which the Reversal rule of system ADR-0006 already prices in. | S | Could make the hosted service cheaper to insure. |
| Version pinning | hosted Tenant | Proposed: if pursued, pin the certification to one quarterly version and schedule re-audits. | S | Avoids a certificate that ages out unnoticed. |

**Shipped adoption:** UiPath certified 2026-03-09 [secondary] (https://www.uipath.com/newsroom/uipath-achieves-aiuc-1-certification); OWASP crosswalk [secondary] (https://labs.cloudsecurityalliance.org/research/csa-research-note-aiuc1-owasp-agentic-crosswalk-20260804-csa/)

**Open problems:** Certifications are tied to quarterly versions; the primary changelog was not verified [secondary] (https://labs.cloudsecurityalliance.org/research/csa-research-note-aiuc1-agentic-ai-security-standard-q2-2026/)

**Watched:** changelog-page `https://www.aiuc-1.com/`

## Algoritmeregister van de Nederlandse overheid (algoritmes.overheid.nl) { #nl-algoritmeregister }

Not to be confused with: A public register of algorithms used by Dutch government bodies. Not the EU high-risk database.

| | |
| --- | --- |
| Steward | Ministerie van BZK (regulator) |
| Status | stable |
| Latest | [voluntary; 1,587 descriptions on 2026-10-12 [secondary] 2026-10-12](https://algoritmes.overheid.nl/) |
| Radar | **hold**: Fit decided it: the register is voluntary and covers government bodies, not Unfold or private Agencies. |
| Moves when | An Agency onboards a Dutch public-sector Client, or registration becomes mandatory. |
| Competes with | — |
| Complements | [Dutch AI Act implementation - Uitvoeringswet AI-verordening (AP and RDI supervision)](governance.md#nl-ai-act-supervision), [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-10-01-run-cards-gamification-evidence-and-law](../../../../../docs/research/2026-10-01-run-cards-gamification-evidence-and-law.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Public-sector Client support | Agency contract | Proposed: give an Agency a ready description of Unfold, in the register's format, for a Dutch government Client that registers its algorithms. | S | Removes friction when a public body is the Client. |
| Draft description from the impact assessment | hosted Tenant | Proposed: derive the register text from the impact assessment if one is written. | S | One source for both documents. |
| Run Card works-council context | Run Card | The 2026-10-01 law research and the works-council pack already discuss the register; keep that as the reference for public employers. | S | Reuses existing analysis. |
| No registration by Unfold | Agency contract | State that the register is for government bodies, so neither Unfold nor a private Agency registers. | S | Avoids wasted effort. |
| Watch for a mandate | Unfold workbench | Track whether registration becomes mandatory by end of 2026 as targeted. | S | Early notice if public Clients must register. |

**Shipped adoption:** Register (https://algoritmes.overheid.nl/); Kamerbrief (https://zoek.officielebekendmakingen.nl/kst-26643-1394.html)

**Open problems:** Not legally mandatory, despite an adopted motion and a target of all impactful algorithms by end of 2026 [secondary] (https://opsiocloud.com/nl/blogs/shadow-ai-algoritmeregister-ai-register/)

**Watched:** changelog-page `https://algoritmes.overheid.nl/`

## CEN-CENELEC JTC 21 harmonised standards for the AI Act - EN 18286 (QMS), prEN 18282 (cybersecurity), prEN 18229 (trustworthiness framework), prEN 18228 (risk management) { #eu-ai-act-harmonised-standards }

Not to be confused with: Standards that grant presumption of conformity for high-risk providers once cited in the OJ. Only EN 18286 is cited so far.

| | |
| --- | --- |
| Steward | CEN-CENELEC JTC 21 (sdo) |
| Status | stabilising |
| Latest | [EN 18286:2026 cited by Commission Implementing Decision (EU) 2026/2274, OJ on World Standards Day (2026-10-14) 2026-10-14](https://digital-strategy.ec.europa.eu/en/library/first-harmonised-standard-supporting-ai-act-published-official-journal) |
| Radar | **assess**: Legal obligation decided it: these standards matter only for high-risk providers, which Unfold is not, and only EN 18286 is cited so far. |
| Moves when | prEN 18282 is cited in the Official Journal, or Unfold or an Agency use becomes high-risk. |
| Competes with | — |
| Complements | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act), [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001) |
| Builds on | [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001) |
| Superseded by | — |
| Decisions | [0010-one-release-train-with-zero-cve-images](../../../../../apps/unfold/docs/adrs/0010-one-release-train-with-zero-cve-images.md), [adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with](../../../../../docs/adr/adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| EN 18286 as a quality reference | release pipeline | Proposed: read EN 18286 and note which of its quality-management elements the release train, floors and CVE gates already provide (system ADR-0043, Unfold ADR-0010). | S | Cheap evidence of process maturity, even though Unfold is not high-risk. |
| Cybersecurity standard watch | Ploeg threat model | Track prEN 18282 after its rejected enquiry, and map Ploeg's threat model to it once a version passes. | S | Ready mapping when the standard arrives. |
| Agency in a high-risk project | Agency contract | Proposed: if an Agency builds an Annex III system for a Client with Unfold, point it to EN 18286 for its own quality system; Unfold remains a tool, which needs counsel to confirm. | S | Clear guidance for the rare high-risk Client. |
| Risk-management standard | Unfold workbench | Watch prEN 18228 after its comment resolution in November 2026. | S | Picks up the EU risk method when it settles. |
| No conformity claim | hosted Tenant | Do not claim presumption of conformity, since it applies only to high-risk providers using cited standards. | S | Accurate claims. |

**Shipped adoption:** CEN-CENELEC OJEU notice 2026-10-15 (https://www.cencenelec.eu/news-events/news/2026/en-in-the-spotlight/2026-10-15-en-18286-2026-published-in-ojeu/); NEN-EN 18286:2026 (https://www.nen.nl/en/nen-en-18286-2026-en-354718)

**Open problems:** prEN 18282 cybersecurity: enquiry closed 2026-07-30 and a majority rejected it; revised scope ballot ran to 2026-09-16 [secondary]; prEN 18229-1: enquiry closed 2026-08-20 and was rejected on the weighted-population threshold; 443 comments [secondary]; prEN 18229-2: awaiting Commission pre-enquiry assessment [secondary]; prEN 18228 risk: rejected, with CRM in the first week of Nov 2026 then formal vote [secondary]. All four points from https://krogrules.com/news/edition-16-september-2026

**Watched:** changelog-page `https://www.cencenelec.eu/news-events/news/`, changelog-page `https://standards.cencenelec.eu/`

## Dutch AI Act implementation - Uitvoeringswet AI-verordening (AP and RDI supervision) { #nl-ai-act-supervision }

Not to be confused with: Dutch implementing bill designating market surveillance authorities. The AP (Autoriteit Persoonsgegevens) acts as coordinating and fallback supervisor with an 'AI-bestuurder'; the RDI (Rijksinspectie Digitale Infrastructuur) coordinates and is the central contact point [RDI contact-point role secondary].

| | |
| --- | --- |
| Steward | Dutch government (BZK/EZK); AP; RDI (regulator) |
| Status | draft |
| Latest | [bill; internet consultation 2026-04-20 to 2026-06-01; to Tweede Kamer after Raad van State advice 2026-06-01](https://www.internetconsultatie.nl/uaiv/b1) |
| Radar | **assess**: Legal obligation decided it: Dutch Agencies are the first buyers, but the implementing act is still a bill with no formal designation. |
| Moves when | The Uitvoeringswet AI-verordening is adopted and published in the Staatsblad. |
| Competes with | — |
| Complements | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act), [Algoritmeregister van de Nederlandse overheid (algoritmes.overheid.nl)](governance.md#nl-algoritmeregister) |
| Builds on | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Superseded by | — |
| Decisions | [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md), [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Name the supervisor in Agency material | Agency contract | Proposed: once the bill passes, name the AP as coordinating supervisor and the RDI as contact point in the hosted service's compliance notes for Dutch Agencies. | S | Dutch Agencies know whom they answer to. |
| Incident path | hosted Tenant | Proposed: add the supervisor to the hosted incident runbook once designation is formal. | S | No search during an incident. |
| Track the bill | Unfold workbench | Check the bill's progress after the Raad van State advice and its debate in the Tweede Kamer. | S | Fines need the bill as legal basis, so its date matters. |
| AP guidance on transparency | Run evidence | Proposed: compare the AI-marking contract with any AP guidance on Article 50 when published. | S | Aligns the marking with the local supervisor's reading. |
| Algorithm supervision overlap | Agency contract | Proposed: note the AP's double role for algorithms and personal data when Agencies process Client data. | S | One supervisor relationship to manage. |

**Shipped adoption:** Consultation notice 2026-04-21 (https://www.digitaleoverheid.nl/nieuws/consultatie-uitvoeringswet-ai-verordening-van-start/)

**Open problems:** As of Oct 2026 still a bill; no authority formally designated, and Art. 99 fines need the bill as legal basis [secondary] (https://vastpilot.nl/uitvoeringswet-ai-verordening.html, https://theinnovativelawyer.ai/insights/concept-uitvoeringswet-ai-verordening-wat-regelt-nederland-zelf)

**Watched:** changelog-page `https://www.internetconsultatie.nl/uaiv/b1`, changelog-page `https://www.autoriteitpersoonsgegevens.nl/themas/algoritmes-ai`

## EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI) { #eu-ai-act }

Not to be confused with: Law. The omnibus is dated 2026-07-08, was published in the OJ on 2026-07-24 and entered into force on 2026-07-27 [OJ/entry dates secondary; act on EUR-Lex https://eur-lex.europa.eu/eli/reg/2026/1744/oj]. A corrigendum (2026/1744Ber) dated 2026-09-29 is listed [secondary] (https://www.dinmedia.de/en/regulation/euv-2026-1744ber/406956901).

| | |
| --- | --- |
| Steward | European Union (AI Office; national market surveillance authorities) (regulator) |
| Status | law |
| Latest | [2024/1689 consolidated 2026-07-27 2026-07-27](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/fra) |
| Radar | **adopt**: Legal obligation decided it: Article 50 applies now and Unfold and each Agency hold provider or deployer roles; the role split needs counsel. |
| Moves when | Not applicable as a law; revisit when Unfold adds a use listed in Annex III, starts fine-tuning and placing a model on the market, or a further omnibus changes Article 50. |
| Competes with | — |
| Complements | [CEN-CENELEC JTC 21 harmonised standards for the AI Act - EN 18286 (QMS), prEN 18282 (cybersecurity), prEN 18229 (trustworthiness framework), prEN 18228 (risk management)](governance.md#eu-ai-act-harmonised-standards), [Dutch AI Act implementation - Uitvoeringswet AI-verordening (AP and RDI supervision)](governance.md#nl-ai-act-supervision), [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001), [C2PA Content Credentials specification](security-supply-chain.md#c2pa) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md), [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [0049-the-agents-window-has-an-unfold-chat-that-reads-and-acts-on-confirm](../../../../../apps/unfold/docs/adrs/0049-the-agents-window-has-an-unfold-chat-that-reads-and-acts-on-confirm.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T30 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Article 50(2) marking of agent text | Run evidence | Built: apps/unfold/docs/contracts/ai-marking.md and src/ai-marking.ts mark every agent-written pull request and commit with a sentence, a marker, a label and Assisted-by trailers; the grace period for systems placed before 2026-08-02 ends on 2026-12-02. Whether this meets any party's duty needs counsel. | S | The main transparency duty for generated text already has a working mechanism. |
| Role allocation in the Agency contract | Agency contract | Proposed: state in the hosted agreement who is provider and who is deployer, since an Agency that puts its own name on the system may be treated as provider; the 2026-09-29 legal research marks this for a lawyer. | M | Removes the biggest legal ambiguity before the first sale. |
| Article 50(1) disclosure on chat surfaces | Unfold Chat | Proposed: show an unremovable notice that people interact with an AI system in Unfold Chat (Unfold ADR-0049) and in any white-label Client Portal. | S | Covers the interaction-disclosure duty for the surfaces where people talk to a model. |
| High-risk use exclusion | Agency contract | Proposed: forbid Annex III uses such as recruitment or credit scoring in the acceptable-use policy, or make them the Client's responsibility, before Annex III duties apply on 2027-12-02. | S | Keeps Unfold out of high-risk obligations it is not built for. |
| AI literacy and audit context for Agencies | hosted Tenant | Proposed: give Agencies material for their Article 4 staff literacy and record SEP-2817 audit context next to the AI marking (watchlist T30). | M | Helps each Agency meet its deployer duties with evidence Unfold already produces. |

**Shipped adoption:** Omnibus act (https://eur-lex.europa.eu/eli/reg/2026/1744/oj?locale=en); Parliament position 2026-06-16 (https://data.europarl.europa.eu/distribution/doc/TA-10-2026-0198_en.pdf)

**Open problems:** Timeline after the omnibus: prohibitions and AI literacy (Art. 4) applied from 2025-02-02, and the omnibus softens Art. 4 to 'support' staff literacy [secondary]. GPAI obligations applied from 2025-08-02. Art. 50 transparency from 2026-08-02, with a 50(2) marking grace to 2026-12-02 for systems placed before 2026-08-02 [secondary]. New Art. 5 nudifier/CSAM ban from 2026-12-02 [secondary]. Annex III high-risk from 2027-12-02. Annex I high-risk from 2028-08-02. Sources: https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/ and https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html; What applies to an agency deploying LLM agents: as a deployer, AI literacy (Art. 4) and Art. 50(4) disclosure for deepfakes and published AI-generated text on matters of public interest. As a provider when it places chatbots on the market under its own name for clients: Art. 50(1) interaction disclosure and 50(2) machine-readable marking. High-risk duties apply only if a use falls in Annex III (e.g. recruitment, credit, education) from 2027-12-02. GPAI provider duties apply only if the deployer substantially modifies or fine-tunes and places a GPAI model on the market. This is analysis built from the article mapping above, not legal advice.

**Watched:** changelog-page `https://eur-lex.europa.eu/eli/reg/2024/1689`, changelog-page `https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai`

## Inspect (inspect_ai) evaluation framework and .eval log format { #inspect-ai }

Not to be confused with: An evaluation framework and log format from the UK AI Security Institute. It is not an observability standard. The log format is EvalLog version 2 (.eval binary, the default since 0.3.46, or .json), and `inspect log schema` prints its JSON schema (https://inspect.aisi.org.uk/eval-logs.html).

| | |
| --- | --- |
| Steward | UK AI Security Institute (UKGovernmentBEIS) (regulator) |
| Status | stabilising |
| Latest | [0.3.287 2026-10-31](https://github.com/UKGovernmentBEIS/inspect_ai/releases/tag/0.3.287) |
| Radar | **assess**: Fit decided it: Inspect suits the model-level questions of the decider, the drill and the judge, but Ploeg's own research rejected wrapping the whole loop, and the 0.x log schema has no stability policy. |
| Moves when | The decider of system ADR-0042 is accepted and needs a scored evaluation before it may act, or Inspect publishes a log-schema stability policy. |
| Competes with | — |
| Complements | [MLCommons AILuminate benchmarks and Assessment Standard](governance.md#mlcommons-ailuminate), [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [2026-08-08-benchmarking-the-loop](../../../../../apps/ploeg/docs/research/2026-08-08-benchmarking-the-loop.md), [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Score the shadow decider | decider (system ADR-0042) | Proposed: write the decider's labelled tool-call cases as an Inspect task and keep the .eval logs, so its precision and recall are measured before it leaves shadow mode. | M | Gives the tripwire a repeatable, versioned score instead of anecdotes. |
| Attack drill results as eval logs | Ploeg attack drill | Proposed: record each run of the recurring hostile-repository drill (Ploeg ADR-0126) as an Inspect log per harness, so a regression in one harness shows up as a lower score. | M | Turns the drill into a trend per harness and model. |
| Bake-off judge calibration | Ploeg bake-off | Proposed: replay stored bake-off Work Items (Ploeg ADR-0135) through the shadow judge as an Inspect dataset to check that its recommendations agree with the person's pick. | M | Shows whether the judge is worth trusting before it advises more people. |
| Evidence for an Agency's AI register | Agency contract | Proposed: export a summary of the eval logs for the models and harnesses a Tenant uses, so an Agency can show its Clients how the agents were tested. | S | Supports AI literacy and due-diligence answers without new tooling at the Agency. |
| Not a wrapper around Ploeg | Ploeg ledger | Keep end-to-end delivery measured from Ploeg's own facts (Ploeg ADR-0045, ADR-0050) as the 2026-08-08 benchmarking research concluded, and use Inspect only for model-level questions. | S | Avoids a second source of truth for Run outcomes. |

**Shipped adoption:** inspect_evals benchmark collection (https://github.com/UKGovernmentBEIS/inspect_evals); Repo is MIT-licensed, ~3.2k stars (https://github.com/UKGovernmentBEIS/inspect_ai)

**Open problems:** No stated schema stability policy; storage changed in 0.3.206 (https://inspect.aisi.org.uk/eval-logs.html); 0.x versioning with near-daily releases (https://github.com/UKGovernmentBEIS/inspect_ai/releases)

**Watched:** github-releases `UKGovernmentBEIS/inspect_ai` at 0.3.287

## ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS) { #iso-iec-42001 }

Not to be confused with: A certifiable management-system standard. Not the AI Act QMS (EN 18286).

| | |
| --- | --- |
| Steward | ISO/IEC JTC 1/SC 42 (sdo) |
| Status | stable |
| Latest | [ISO/IEC 42001:2023 (absence: no amendment found) 2023-12-01](https://www.iso.org/standard/42001) |
| Radar | **assess**: Fit decided it: no law requires it, but it is the certificate Agencies and their Clients recognise, and the hosted offering is not built yet. |
| Moves when | Phase 2 is funded and a pilot Agency or its Client puts an AI governance certificate in its procurement terms. |
| Competes with | [NIST AI Risk Management Framework (AI 100-1) and Generative AI Profile (NIST AI 600-1)](governance.md#nist-ai-rmf) |
| Complements | [ISO/IEC 42005:2025 (AI system impact assessment) and ISO/IEC 42006:2025 (requirements for AIMS audit and certification bodies)](governance.md#iso-iec-42005-42006), [CEN-CENELEC JTC 21 harmonised standards for the AI Act - EN 18286 (QMS), prEN 18282 (cybersecurity), prEN 18229 (trustworthiness framework), prEN 18228 (risk management)](governance.md#eu-ai-act-harmonised-standards) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Management system for the hosted service | hosted Tenant | Proposed: before phase 2 sells to Agencies, scope an AI management system around the hosted Tenant service, reusing the ADR ledger and runbooks as documented information. | L | A certifiable answer to Agencies whose Clients ask for AI governance. |
| Combine with ISO 27001 | hosted Tenant | Proposed: the 2026-09-29 legal research expects NIS2-scoped Clients to ask for ISO 27001; plan 42001 as an extension of the same management system. | L | One audit programme instead of two. |
| Model provider evidence | Ploeg routing | Proposed: prefer model providers that hold 42001 for hosted Tenants, as the inference-provider evidence already records which do. | S | Supplier control with a cited certificate. |
| Agency template | Agency contract | Proposed: give Agencies a short control mapping showing how Unfold's controls support their own 42001 effort. | M | Helps Agencies that pursue certification themselves. |
| Not an AI Act shortcut | Agency contract | State that 42001 grants no AI Act presumption of conformity; EN 18286 does that for Article 17 high-risk providers. | S | Avoids a wrong compliance claim. |

**Shipped adoption:** ISO overview (https://www.iso.org/insights/iso-42001-explained)

**Open problems:** The publication month is taken from prior catalogue knowledge; iso.org returned 403 to fetches (not verified); No AI Act presumption of conformity; EN 18286 holds that role for Art. 17 (https://digital-strategy.ec.europa.eu/en/library/first-harmonised-standard-supporting-ai-act-published-official-journal)

## ISO/IEC 42005:2025 (AI system impact assessment) and ISO/IEC 42006:2025 (requirements for AIMS audit and certification bodies) { #iso-iec-42005-42006 }

Not to be confused with: 42005 is guidance and not certifiable. 42006 is for certification bodies only.

| | |
| --- | --- |
| Steward | ISO/IEC JTC 1/SC 42 (sdo) |
| Status | stable |
| Latest | [42005:2025 (May 2025); 42006:2025 (July 2025) 2025-07-01](https://www.iso.org/standard/42005) |
| Radar | **assess**: Fit decided it: 42005 gives Agencies a useful impact-assessment shape, while 42006 matters only when choosing an auditor. |
| Moves when | An Agency asks for an impact assessment of Unfold, or the 42001 work starts. |
| Competes with | — |
| Complements | [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001), [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Builds on | [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001) |
| Superseded by | — |
| Decisions | [2026-10-01-run-cards-gamification-evidence-and-law](../../../../../docs/research/2026-10-01-run-cards-gamification-evidence-and-law.md), [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Impact assessment template for Agencies | Agency contract | Proposed: publish an AI system impact assessment for Unfold following ISO/IEC 42005, which an Agency can adapt as deployer. | M | Saves each Agency writing its own from scratch. |
| Impact of generated art and Run Cards | Run Card | Proposed: include the gamified Run Card surfaces, already studied in the 2026-10-01 law research, in the impact assessment. | S | Covers the surface most likely to raise works-council concerns. |
| Client-level assessment | hosted Tenant | Proposed: let an Agency attach a per-Client impact note to a Client Project. | M | Records when a Client's domain raises the risk. |
| Choosing a certification body | hosted Tenant | If 42001 is pursued, check that the certification body is accredited under ISO/IEC 42006. | S | Avoids a certificate buyers do not trust. |
| Guidance, not certification | Agency contract | Describe 42005 as guidance, since it is not certifiable. | S | Accurate claims. |

**Shipped adoption:** 42005 (https://www.iso.org/standard/42005); 42006 (https://www.iso.org/standard/42006)

**Open problems:** Exact day-level dates not verified (iso.org returned 403)

## MLCommons AILuminate benchmarks and Assessment Standard { #mlcommons-ailuminate }

Not to be confused with: Safety and jailbreak benchmark suites with published grades. It is not an eval log format.

| | |
| --- | --- |
| Steward | MLCommons (consortium) |
| Status | stabilising |
| Latest | [Safety 1.2.1 (first public results Oct 2026); Jailbreak 1.1; Agentic Security 0.2 (member testers Oct 2026); Assessment Standard v1.4 (May 2026) 2026-10-01](https://mlcommons.org/ailuminate/) |
| Radar | **hold**: Fit decided it: the benchmarks grade general chat-model safety, the agentic suite is member-only, and Unfold's risk sits in tool use and code, not in harmful chat answers. |
| Moves when | MLCommons publishes an agentic security or reliability benchmark openly that covers coding agents or tool use. |
| Competes with | — |
| Complements | [Inspect (inspect_ai) evaluation framework and .eval log format](governance.md#inspect-ai) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [0049-the-agents-window-has-an-unfold-chat-that-reads-and-acts-on-confirm](../../../../../apps/unfold/docs/adrs/0049-the-agents-window-has-an-unfold-chat-that-reads-and-acts-on-confirm.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Model choice input for Roles | Ploeg routing | Proposed: when a Team adds a Model to a Role's list (Ploeg ADR-0103), note the model's public AILuminate safety grade, where one exists, next to price and coding scores. | S | Adds one public safety signal to model selection at almost no cost. |
| Unfold Chat safety baseline | Unfold Chat | Proposed: run the public demo prompt subset against the model behind Unfold Chat (Unfold ADR-0049) once per model change to catch a model that answers clearly harmful requests. | S | A cheap smoke test for the one surface where people type free text to a model. |
| Agentic security benchmark watch | Ploeg attack drill | Proposed: compare Agentic Security 0.2 scenarios with the hostile-repository drill (Ploeg ADR-0126) once they become public, and import any scenario the drill lacks. | S | Reuses outside attack cases instead of inventing them. |
| Procurement answer for Agencies | Agency contract | Proposed: list the grades of the models a Tenant can use in the Agency-facing model sheet, clearly marked as third-party results. | S | Answers a common procurement question with a citable source. |
| No grade claims for Unfold itself | hosted Tenant | Do not claim an AILuminate result for Unfold, because the benchmarks grade chat models, not a coding-agent system that ends in a reviewed pull request. | S | Keeps marketing claims honest. |

**Shipped adoption:** Public safety results (https://mlcommons.org/ailuminate/safety/results/); Jailbreak 1.0 paper (https://arxiv.org/abs/2610.02827); modelbench runner, last release v1.0.0 2024-12-03 (https://github.com/mlcommons/modelbench/releases)

**Open problems:** Agentic benchmarks are member-only (Agentic Security 0.2) and no agentic reliability benchmark is named (https://mlcommons.org/ailuminate/agentic/); The public prompt set is a demo subset; the mlcommons/ailuminate repo has had no push since 2025-06-11 (https://github.com/mlcommons/ailuminate)

**Watched:** changelog-page `https://mlcommons.org/ailuminate/`, github-releases `mlcommons/modelbench` at v1.0.0

## Model Context Protocol Associate (MCPA) certification { #aaif-mcpa }

Not to be confused with: Individual practitioner certification from the Agentic AI Foundation (Linux Foundation). Not product conformance.

| | |
| --- | --- |
| Steward | Agentic AI Foundation (AAIF) / Linux Foundation Training (foundation) |
| Status | stable |
| Latest | [launched (exam reportedly aligned to MCP spec 2026-07-28 [secondary]) 2026-09-14](https://www.linuxfoundation.org/press/agentic-ai-foundation-launches-mcpa-certification-to-validate-mcp-expertise) |
| Radar | **hold**: Fit decided it: it certifies people, not Unfold, and says nothing about the product. |
| Moves when | An Agency asks for certified staff, or AAIF launches product-level MCP certification. |
| Competes with | — |
| Complements | [MCP conformance suite (@modelcontextprotocol/conformance)](security-supply-chain.md#mcp-conformance) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Maintainer skills check | unfold-mcp | Proposed: a maintainer of unfold-mcp or ploeg-mcp could take the exam as a structured spec review. | S | Low-cost check on spec knowledge. |
| Agency developer onboarding | Agency contract | Proposed: point Agency developers to MCPA as optional training before they use Unfold's MCP servers. | S | Reduces support load. |
| Not product conformance | unfold-mcp | Keep the conformance suite, not MCPA, as product evidence. | S | Correct evidence type. |
| Hiring signal | Unfold workbench | Treat MCPA as a weak signal only, given conflicting exam details. | S | Avoids over-weighting a new credential. |
| Literacy evidence | hosted Tenant | Proposed: an Agency could list certified staff as part of Article 4 literacy evidence; whether it counts needs counsel. | S | Possible support for a deployer duty. |

**Shipped adoption:** Press release (https://www.linuxfoundation.org/press/agentic-ai-foundation-launches-mcpa-certification-to-validate-mcp-expertise)

**Open problems:** Price and duration conflict across sources [secondary] (https://devopscube.com/mcpa-certification-exam-guide/)

**Watched:** changelog-page `https://training.linuxfoundation.org/blog/just-launched-model-context-protocol-associate-mcpa-certification/`

## NIST AI Agent Standards Initiative (CAISI, now named CAISSI on NIST pages) { #nist-caisi-agent-standards }

Not to be confused with: A NIST program (announced 2026-02-17) with three pillars: industry standards, open protocols, and agent security/identity research. Not a standard itself.

| | |
| --- | --- |
| Steward | NIST CAISSI (Center for Advancing Innovation and Standards for Super Intelligence) (regulator) |
| Status | draft |
| Latest | [initiative page updated 2026-08-14; only guideline listed is the 'Practices for Automated Benchmark Evaluations of Language Models' IPD (comments closed 2026-03-31) 2026-09-30](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative) |
| Radar | **hold**: Maturity decided it: it is a program, not a standard, and its agent security guidelines are announced but unpublished. |
| Moves when | NIST publishes the agent security or identity guidelines. |
| Competes with | — |
| Complements | [SP 800-53 Control Overlays for Securing AI Systems (COSAiS), renamed Control Overlays for Super Intelligence Systems (COSIS) on 2026-10-20](governance.md#nist-cosais), [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0149-a-declared-plugin-may-receive-a-signed-run-identity-that-names-its-run-and-authorizes-nothing](../../../../../apps/ploeg/docs/adrs/0149-a-declared-plugin-may-receive-a-signed-run-identity-that-names-its-run-and-authorizes-nothing.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Agent identity guidance | Ploeg ledger | Proposed: when the agent security and identity guidelines appear, compare them with the signed run identity (Ploeg ADR-0149) and transaction token (Ploeg ADR-0156). | S | Checks Unfold's identity model against the first government guidance. |
| Benchmark practice | Ploeg bake-off | Proposed: apply the automated-benchmark practices draft to how bake-offs (Ploeg ADR-0135) report results. | S | More defensible comparison claims. |
| Open protocols pillar | unfold-mcp | Proposed: watch whether the initiative backs MCP or A2A profiles that affect system ADR-0050's standards choice. | S | Early warning on protocol direction. |
| Interop testing | unfold-mcp | Proposed: join any public interoperability event if it covers MCP servers. | M | External test of unfold-mcp. |
| No claim of alignment | Agency contract | Do not claim alignment with the initiative, since it has published no agent standard. | S | Keeps claims accurate. |

**Shipped adoption:** "Announcement (https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure)"; "Agent security RFI, closed 2026-03-09 (https://www.nist.gov/news-events/news/2026/01/caisi-issues-request-information-about-securing-ai-agent-systems)"

**Open problems:** "Agent security guidelines announced as upcoming but not published (https://www.nist.gov/caissi/guidelines)"

**Watched:** changelog-page `https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative`, changelog-page `https://www.nist.gov/caissi/guidelines`

## NIST AI Risk Management Framework (AI 100-1) and Generative AI Profile (NIST AI 600-1) { #nist-ai-rmf }

Not to be confused with: A voluntary US risk framework. AI 600-1 is its GenAI profile.

| | |
| --- | --- |
| Steward | NIST (sdo) |
| Status | stable |
| Latest | [AI RMF 1.0 (2023-01-26, revision in progress); AI 600-1 (2024-07-26, page updated 2026-04-08) 2026-04-08](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) |
| Radar | **hold**: Fit decided it: it is voluntary US guidance with no agent profile, and Unfold's first buyers are Dutch Agencies bound by EU law. |
| Moves when | NIST publishes the revised RMF with an agent profile, or an Agency's Client requires an RMF mapping. |
| Competes with | [ISO/IEC 42001:2023 Artificial intelligence - Management system (AIMS)](governance.md#iso-iec-42001) |
| Complements | [SP 800-53 Control Overlays for Securing AI Systems (COSAiS), renamed Control Overlays for Super Intelligence Systems (COSIS) on 2026-10-20](governance.md#nist-cosais), [MITRE ATLAS (Adversarial Threat Landscape for AI Systems)](security-supply-chain.md#mitre-atlas) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0005-unfold-is-offered-to-agencies](../../../../../docs/adr/adr-0005-unfold-is-offered-to-agencies.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Risk register vocabulary | Unfold workbench | Proposed: use Govern, Map, Measure, Manage as headings for a short Unfold AI risk register, if one is written. | S | A free, well-known structure. |
| GenAI profile check | Run evidence | Proposed: check AI 600-1 risks such as confabulation and information security against Run evidence and the review loop (Ploeg ADR-0017). | S | Finds risks the security lists skip. |
| Crosswalk to ISO 42001 | hosted Tenant | Proposed: if ISO/IEC 42001 is pursued, reuse public crosswalks rather than mapping twice. | S | Less duplicate work. |
| Non-EU Clients of Agencies | Agency contract | Proposed: answer an Agency's US Client questionnaire with the RMF mapping. | S | Covers a buyer group the EU frameworks do not. |
| Watch the revision | Unfold workbench | Track the announced RMF 1.0 revision for an agent profile. | S | Picks up agent guidance when it appears. |

**Shipped adoption:** AI 600-1 DOI (https://doi.org/10.6028/NIST.AI.600-1); Critical-infrastructure profile concept note 2026-04-07 (https://www.nist.gov/itl/ai-risk-management-framework)

**Open problems:** 'The AI RMF 1.0 is being revised as part of the White House AI Action Plan', no draft or date (https://www.nist.gov/itl/ai-risk-management-framework); No agent profile

**Watched:** changelog-page `https://www.nist.gov/itl/ai-risk-management-framework`

## SP 800-53 Control Overlays for Securing AI Systems (COSAiS), renamed Control Overlays for Super Intelligence Systems (COSIS) on 2026-10-20 { #nist-cosais }

Not to be confused with: Planned SP 800-53 overlays, including single-agent and multi-agent overlays (planned NISTIR 8605D). The rename cites a 2026-09-29 Executive Order (not verified).

| | |
| --- | --- |
| Steward | NIST CSRC (sdo) |
| Status | draft |
| Latest | [Predictive AI annotated outline (2026-01-08); agent overlays 'Proposed', no draft 2026-10-20](https://csrc.nist.gov/projects/cosis) |
| Radar | **hold**: Maturity decided it: the agent overlays are only proposed, with no draft or date. |
| Moves when | NIST publishes a public draft of the single-agent or multi-agent overlay. |
| Competes with | — |
| Complements | [NIST AI Risk Management Framework (AI 100-1) and Generative AI Profile (NIST AI 600-1)](governance.md#nist-ai-rmf), [NIST AI Agent Standards Initiative (CAISI, now named CAISSI on NIST pages)](governance.md#nist-caisi-agent-standards) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour](../../../../../apps/ploeg/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md), [0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it](../../../../../apps/ploeg/docs/adrs/0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Agent overlay as control source | Ploeg ledger | Proposed: once the single-agent and multi-agent overlays have drafts, compare them with Ploeg's budget, credential and attribution controls (Ploeg ADR-0013, ADR-0156). | M | Checks controls against a federal baseline. |
| Isolation controls | Ploeg cells | Proposed: map the isolation floor (Ploeg ADR-0106) to any overlay control on execution boundaries. | S | Cited evidence for sandbox claims. |
| Hosted service control set | hosted Tenant | Proposed: use the overlay only if a Client of an Agency works under SP 800-53. | M | Opens a niche buyer group. |
| Credential handling | Ploeg worker | Proposed: compare 'no credential enters the harness' (Ploeg ADR-0138) with overlay controls. | S | External support for an existing rule. |
| Watch the rename | Unfold workbench | Track the renamed COSIS project page for the first agent draft. | S | Low-cost monitoring. |

**Shipped adoption:** Concept paper 2025-08-14 and predictive outline (https://csrc.nist.gov/csrc/media/Projects/cosais/documents/COSAiS-Predictive-AI-annotated-outline-Jan2026.pdf)

**Open problems:** No agent overlay draft and no date (https://csrc.nist.gov/projects/cosis)

**Watched:** changelog-page `https://csrc.nist.gov/projects/cosis`
