# Legal, regulatory and tax requirements for Glide (NL B2B AI coding-agent platform, white-label resale), as of September 2026

Not legal or tax advice. Items marked **[LAWYER]** or **[TAX ADVISER]** need professional sign-off before launch.

Method note: several primary sites (autoriteitpersoonsgegevens.nl, joneswalker.com, clydeco.com, vatupdate.com) were blocked by this environment's egress proxy, so a number of findings rest on search-result summaries of those pages rather than full reads. Such findings are marked "(search summary)". Points drawn from general legal knowledge rather than a fetched source are placed under Inferences and should be verified.

## 1. GDPR roles, DPA (verwerkersovereenkomst), international transfers, Chinese model providers, data residency, AP guidance

### Takeaway
The expected chain is agency (controller) -> Glide (processor) -> model providers and hosting (sub-processors). The agency must be able to verify every link in that chain (EDPB Opinion 22/2024). US providers can currently be used under the EU-US Data Privacy Framework (DPF). The General Court upheld the DPF in September 2025, but an appeal to the CJEU is pending, so SCCs should be kept as a fallback. Sending personal data to DeepSeek's own China-hosted API has no workable transfer mechanism, and German and Italian regulators have acted against it. Use DeepSeek only as open weights hosted in the EU, or not at all, for client data.

### Cited Findings
- EDPB Opinion 22/2024 (adopted 7 Oct 2024) says the controller's duty to verify applies to **all (sub-)processors in the chain, whatever the risk**. The controller must check that each processor, sub-processor and sub-sub-processor gives sufficient guarantees — [EDPB Opinion 22/2024](https://www.edpb.europa.eu/system/files/2024-10/edpb_opinion_202422_relianceonprocessors-sub-processors_en.pdf); [Lydian summary](https://www.lydian.be/en/news-insights/new-edpb-guidelines-controllers-obligations-data-processing-chain-and-legally)
- The controller does not have to ask for every sub-processing contract as a matter of routine. It decides case by case whether it needs one to demonstrate accountability — [HSF Kramer on Opinion 22/2024](https://www.hsfkramer.com/notes/data/2024-posts/EDPB-Opinion--How-far-down-the-supply-chain-do-controller-duties-extend--)
- Under Art. 28(4) GDPR the initial processor must pass the same data-protection obligations down to its sub-processors, and so on along the chain — [BDK Advokati](https://bdkadvokati.com/edpb-opinion-22-2024-key-insights-on-using-processors-and-sub-processors-under-gdpr)
- DPF status: on 3 Sept 2025 the General Court dismissed Latombe's challenge (T-553/23) and upheld the 2023 adequacy decision — [IAPP](https://iapp.org/news/a/european-general-court-dismisses-latombe-challenge-upholds-eu-us-data-privacy-framework)
- Latombe appealed to the CJEU on 31 Oct 2025 (C-703/25 P). No hearing date had been announced by mid-2026 (search summary). The CJEU has historically been stricter than the General Court, as Schrems I and II show — [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework); [Berkeley Tech Law Journal](https://btlj.org/2026/02/third-times-the-charm-the-fate-of-the-eu-u-s-data-privacy-framework/)
- DeepSeek: Italy's Garante imposed a ban within 72 hours, and investigations followed in 13 European jurisdictions (search summary) — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-regulators-scrutinize-deepseek-for-data-privacy-violations/)
- The Berlin DPA found that DeepSeek cannot show that German users' data gets equivalent protection in China. It used the DSA notice-and-action mechanism to ask Apple and Google to delist the app — [VinciWorks](https://vinciworks.com/blog/germany-moves-to-block-deepseek-will-the-rest-of-the-eu-follow/); [European Law Blog](https://europeanlawblog.eu/hn5byrag/)
- China has no EU adequacy decision. Under China's 2017 National Intelligence Law, organisations must "support, assist and cooperate" with intelligence work, which makes a supplementary-measures (TIA) analysis for China especially hard — [IAPP](https://iapp.org/news/a/deepseek-and-the-china-data-question-direct-collection-open-source-and-the-limits-of-extraterritorial-enforcement); [GRIP / Global Relay](https://www.grip.globalrelay.com/deepseek-and-personal-data-transfers-to-china/)
- AP (Dutch DPA): its *Report AI & Algorithms Netherlands – March 2026* says AI risks have risen "exponentially" over six months. Four of the nine AI Impact Barometer indicators are now red, up from two, and the AP reports that organisations are trying to get around the rules or not complying — [AP report page](https://www.autoriteitpersoonsgegevens.nl/en/documents/report-ai-algorithms-netherlands-march-2026); [Techzine](https://www.techzine.nl/nieuws/privacy-compliance/575712/autoriteit-persoonsgegevens-waarschuwt-voor-ai-risicos/)
- The AP is also the Dutch coordinating supervisor for algorithms and AI, and it publishes AI Act guidance — [AP EU AI Act theme page](https://www.autoriteitpersoonsgegevens.nl/en/themes/algorithms-ai/eu-ai-act)
- Pending GDPR changes: the "Data Omnibus" part of the Digital Omnibus (GDPR, ePrivacy, NIS2, DORA) was **still in negotiation** as of Sept 2026, with adoption expected late 2026 at the earliest. Proposals include a relative definition of personal data for pseudonymised data, and legitimate interest as a basis for AI development and operation with an unconditional right to object — [Usercentrics](https://usercentrics.com/knowledge-hub/gdpr-changes/); [Taylor Wessing](https://www.taylorwessing.com/en/global-data-hub/2026/the-digital-omnibus-proposal); [EP Legislative Train](https://www.europarl.europa.eu/legislative-train/theme-a-new-plan-for-europe-s-sustainable-prosperity-and-competitiveness/file-digital-package)

### Inferences
- **Why roles matter for Glide.** Source code contains personal data: commit author names and emails, customer data in fixtures, logs and database dumps, and ticket text written by end-clients. So Glide is a processor even though it "only" handles code.
  - If Glide uses client data for its own purposes (product analytics, training, prompt tuning, benchmarking), it becomes a controller for that processing and needs its own legal basis.
  - Recommendation: contractually prohibit training on customer data, and require the same of every model provider through zero-retention or no-training API terms.
- **White-label chain.** The agency's client (the end business) is usually the real controller of its repository's personal data. That makes the agency a processor and Glide a **sub-processor**, not a processor.
  - The Glide DPA must therefore work in both configurations. It should allow the agency to flow terms up to its client and should support the client's audit and verification rights through the agency.
  - **[LAWYER]** Draft a DPA that covers both configurations.
- **Art. 28(3) GDPR checklist for the verwerkersovereenkomst.** This is general GDPR knowledge; verify against the text.
  - Subject matter, duration, nature and purpose; data types; categories of data subjects.
  - Processing only on documented instructions, including instructions on transfers.
  - Confidentiality of personnel.
  - Art. 32 security measures, set out in an annex.
  - Sub-processor conditions: prior general written authorisation, a published list, advance notice of changes and a right to object.
  - Assistance with data-subject rights, and with Art. 32–36 obligations: breach notification, DPIA, prior consultation.
  - Deletion or return of data at the end of the contract.
  - Audit and inspection rights.
  - A duty to flag instructions that infringe the law.
  - Add to that a transfer annex (DPF certification or SCCs for each provider) and a breach-notification SLA; 24–48h is typical in NL practice so the controller can meet its 72h deadline.
  - The EU Commission's Art. 28(7) standard contractual clauses (2021/915) or the Dutch "Model Verwerkersovereenkomst" (Data Pro Code / NLdigital) are ready-made starting points.
- **Transfers by provider.**
  - **Anthropic and OpenAI.** Use the DPF where the entity is certified, with SCCs (Module 3, processor-to-processor) as a fallback, plus a transfer impact assessment. Where available, prefer EU-region processing or data-residency offerings, for example through AWS Bedrock (EU regions), Google Vertex or Azure OpenAI EU Data Zone.
  - **Mistral (FR).** No transfer issue. A strong "EU-only" default for Dutch clients that care about residency.
  - **DeepSeek.** Never send client data to DeepSeek's first-party API (China). If DeepSeek is offered, run the **open-weights model on EU infrastructure** (self-hosted or an EU inference provider). That removes the Chapter V transfer entirely. Test the model and document why it was chosen.
- **Data residency expectations.** Offer a tiered routing policy the agency can choose: "EU-only models" or "EU + US (DPF)". Record the choice in the order form and DPA, and show it in the portal. Dutch public-sector and regulated-sector clients (government, healthcare, finance) often require EU-only processing and will want a DPIA. This expectation comes from general market practice; no 2026 survey was found.
- Run a DPIA on the platform yourself and give agencies a template. Agents that read whole repositories count as "innovative technology" processing at scale.

### Gaps
- The full text of AP guidance could not be read (site blocked). No AP guidance specific to AI coding agents was found.
- No reliable source was found on whether Anthropic, OpenAI or Mistral's DPF certification and EU data-residency offerings changed in 2026. Check each provider's current DPA and sub-processor pages directly.
- The CJEU hearing or judgment date in C-703/25 P is unknown as of Sept 2026.

## 2. EU AI Act obligations in 2026 (Article 50, GPAI flow-down, timeline, Digital Omnibus)

### Takeaway
Glide builds a system on third-party general-purpose AI (GPAI) models, which makes it a *provider of an AI system* (and a deployer of its own tooling), not a GPAI model provider. Its main 2026 obligations are:
- **AI literacy** (Art. 4, since Feb 2025);
- **Art. 50 transparency** from 2 Aug 2026: people must be told they are interacting with AI, for example in the client portal chat, and machine-readable marking of synthetic content applies with a grace period to 2 Dec 2026;
- contracts that pass through the documentation GPAI providers must supply.

A coding agent is not high-risk under Annex III. The Digital Omnibus on AI (Council final approval 29 June 2026) delayed the high-risk rules, but **did not delay Art. 50(1)**.

### Cited Findings
- The Council gave final approval to the Digital Omnibus on AI on 29 June 2026. Annex III high-risk obligations move to **2 Dec 2027** and Annex I (products) to **2 Aug 2028** — [Secure Privacy](https://secureprivacy.ai/blog/eu-ai-act-digital-omnibus-the-new-high-risk-ai-deadlines-after-council-approval); [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/); [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-omnibus-vii-deadline-delay-20260/)
- The Art. 50 transparency obligations, including telling users they are interacting with an AI system, **applied as scheduled from 2 Aug 2026**. The grace period for Art. 50(2) machine-readable marking of AI-generated content runs to **2 Dec 2026** (search summary) — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/); [Jones Walker](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html?id=102nbon)
- The omnibus also extends the Art. 5 prohibitions to AI that generates non-consensual intimate imagery or CSAM ("nudifier" apps) — [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)
- AP communication: from 2 Aug 2026 "it must be clear when you are talking to an AI chatbot", and much AI-generated content must be labelled (search summary) — [AP news item](https://www.autoriteitpersoonsgegevens.nl/actueel/vanaf-2-augustus-wordt-duidelijker-of-het-ai-is-of-echt)
- AI literacy: since 2 Feb 2025, organisations that develop or use AI must make sure their staff are AI-literate — [AP EU AI Act page](https://www.autoriteitpersoonsgegevens.nl/en/themes/algorithms-ai/eu-ai-act)
- Art. 53 GPAI providers must keep technical documentation, adopt a copyright policy, publish a training-data summary, and **give downstream providers enough information to meet their own obligations** — [Article 53 text](https://artificialintelligenceact.eu/article/53/); [Commission GPAI Q&A](https://digital-strategy.ec.europa.eu/en/faqs/general-purpose-ai-models-ai-act-questions-answers)
- Commission GPAI guidelines (July 2025) say a modifier becomes a GPAI provider only if the modification uses more than about one third of the original model's training compute, and then only for the modification — [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20250724-european-commission-issues-guidelines-for-providers-of-general-purpose-ai-models)
- The GPAI Code of Practice (Art. 56) sets out how GPAI providers can show compliance. GPAI fines go up to 3% of worldwide turnover or EUR 15m — [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/advisories/2025/08/does-your-company-have-eu-ai-act-compliance-obligations)

### Inferences
- **Classification.**
  - Glide's agent pipeline is an "AI system" that Glide places on the market under its own name, so Glide is its **provider**.
  - Agencies using it are **deployers**.
  - With white-label, an agency that puts its own name or trademark on the system may itself count as a provider. Art. 25 treats distributors, importers and deployers as providers if they put their name on a high-risk system; that article concerns high-risk systems, so the effect for non-high-risk systems is mainly contractual. **[LAWYER]** Allocate AI Act roles explicitly in the white-label agreement.
- **High-risk.** Code generation is not on the Annex III list (biometrics, critical infrastructure, education, employment, credit, and so on).
  - Risk: an end-client could use Glide to build a high-risk system, for example HR screening software. That makes the *end-client* the provider of that system, not Glide.
  - Recommendation: prohibit high-risk uses in the AUP, or make them the customer's responsibility.
  - The CV-screening or "recruitment" framing is irrelevant to Glide unless it is used for hiring.
- **Art. 50(1).** The client portal's request intake and quote chat, and any AI-drafted messages sent to end-clients, must disclose AI interaction unless that is obvious from context. This obligation is on the *provider*, Glide, so it has to be built into the white-label portal and must not be configurable away by agencies.
- **Art. 50(2).** Machine-readable marking of synthetic text, audio, image and video applies to generative systems. Whether generated *source code* in a pull request must be marked is unsettled. Low-cost mitigation: label AI-authored PRs and commits with trailers ("Co-Authored-By", "Generated-by") and PR labels. This also supports IP and audit trails.
- **Model-provider flow-down.** Collect each model provider's Art. 53 downstream documentation, acceptable-use policy and Code of Practice signatory status. DeepSeek's AI Act compliance posture is doubtful, which is another reason to use it only via self-hosted open weights, and doing so may make the hosting party responsible for some duties. **[LAWYER]**
- Enforcement: GPAI obligations applied from 2 Aug 2025, and the Commission's enforcement powers over GPAI providers start on 2 Aug 2026. This is from general knowledge of the AI Act timeline; the search results did not confirm it.

### Gaps
- The consolidated Omnibus text in the Official Journal and its publication date were not retrieved. Whether the Omnibus changed Art. 4 AI literacy from an obligation on companies to one on member states and the Commission (proposed in Nov 2025) could not be confirmed. **Verify.**
- No guidance was found on whether AI-generated source code falls under Art. 50(2) marking.

## 3. NIS2 (Cyberbeveiligingswet) and Cyber Resilience Act

### Takeaway
The Dutch NIS2 law (Cyberbeveiligingswet, Cbw) entered into force on 15 Aug 2026 with no transition period. A small SaaS dev platform probably falls **below the size threshold**: medium-size, meaning 50+ staff or more than EUR 10m turnover. Cloud and managed service providers are in scope from that size up, so Glide should check its classification once it grows. In practice, Glide will face NIS2 **supply-chain security requirements** passed down contractually from in-scope customers. The CRA's incident and vulnerability reporting started **11 Sept 2026** for "products with digital elements". **Self-hosted, licensed Glide software is very likely in CRA scope**; pure SaaS is largely outside it.

### Cited Findings
- The Dutch Senate approved the Cbw on 7 July 2026, and it entered into force on 15 Aug 2026 without a general transition period. Registration, duty of care and incident reporting started that day. Board-competence requirements run to 15 Aug 2028. The ten "digital entity" types that feed the ENISA register had until 15 Sept 2026 to register (search summary) — [Clyde & Co](https://www.clydeco.com/en/insights/2026/07/dutch-cybersecurity-act-enters-into-force-on-15-au); [Bird & Bird](https://www.twobirds.com/en/insights/2026/netherlands/nis2-alert-dutch-cybersecurity-act-cyberbeveiligingswet-has-been-adopted--expected-to-enter-into-for); [dsn group](https://www.dsn-group.com/privacy-notes/less-than-a-month-to-go-nis2-in-the-netherlands-is-set-for-15-august-2026)
- More than 8,000 Dutch organisations are in scope, against about 1,000 under the old Wbni. The scope includes cloud providers and MSPs — [Resync](https://re-sync.nl/en/blog/cybersecurity-act-nis2-2026/); [Holm Security](https://www.holmsecurity.com/blog/nis2-in-the-netherlands-what-the-cyberbeveiligingswet-means-how-to-comply)
- CRA: from 11 Sept 2026, manufacturers must report actively exploited vulnerabilities and severe incidents: an early warning within 24h, a notification within 72h, and a final report within 14 days of a fix (vulnerabilities) or within one month (incidents). Reports go through ENISA's Single Reporting Platform — [EC CRA reporting](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting); [Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/cyber-resilience-act-reporting-obligations-take-effect-on-11-september-2026-102nzmk)
- Breaches of CRA reporting duties can be fined up to EUR 15m or 2.5% of worldwide turnover — [Privacy World](https://www.privacyworld.blog/2026/09/cyber-resilience-act-11-september-2026-key-starting-point-for-reporting-obligations/)
- Pure cloud SaaS may be outside the CRA, but client-side software, apps and remote data processing tied to a product bring a business into scope — [Crowell & Moring](https://www.crowell.com/en/insights/client-alerts/eu-cyber-resilience-act-countdown-11-september-2026-incidentvulnerability-reporting-deadline-is-less-than-100-days-away); [Kirkland](https://www.kirkland.com/publications/kirkland-alert/2026/09/the-eu-cyber-resilience-act)

### Inferences
- **Self-hosted licence.** Software licensed commercially for installation counts as a product with digital elements. Glide would be its *manufacturer* and therefore needs:
  - the reporting process now (from 11 Sept 2026);
  - by **11 Dec 2027** (CRA full application, from general knowledge of the CRA timeline; verify), essential cybersecurity requirements, an SBOM, vulnerability handling, security updates over the support period, a CE mark and a declaration of conformity.
  - Classification: a coding-agent platform is probably a "default" (non-important) product, which allows self-assessment. **[LAWYER]**
  - Any CLI or agent runner that Glide distributes to customers also counts as a product.
- **SaaS.** Remote data processing that is essential to a distributed product falls under the CRA. Pure SaaS falls under NIS2 and GDPR Art. 32 instead.
- **NIS2 supply chain.** Agencies and their clients in scope of the Cbw will ask for ISO 27001 or equivalent, incident-notification clauses and security annexes. Budget for an ISMS early.
- **Separate regime.** The EU Data Act has been fully applicable since 12 Sept 2025, and its cloud-switching rules cover SaaS. The contract must give a switching right with a maximum two-month notice period, a transition of at most 30 days, and data retrieval for at least 30 days afterwards. **Switching charges are banned from 12 Jan 2027**; until then they may only cover cost. Prepaid-credit contracts must not lock customers in beyond this — [Alston & Bird](https://www.alston.com/en/insights/publications/2025/09/eu-data-act-switching-requirements-cloud-services); [Lindahl](https://www.lindahl.se/en/latest-news/knowledge/new-requirements-for-cloud-portability-in-the-eu-data-act-practical-implications-for-cloud-service-providers/)

### Gaps
- The exact Dutch size thresholds and entity types for "cloud computing service providers" versus "online platforms" under the Cbw, and the RDI's or other supervisors' roles, could not be read in full (Clyde & Co page blocked).
- The Data Omnibus proposes NIS2 changes (pending); their content was not checked.

## 4. VAT (BTW) on prepaid credits, reverse charge, OSS; accounting for breakage

### Takeaway
Classifying prepaid credits as a single-purpose voucher (SPV), a multi-purpose voucher (MPV) or an ordinary advance payment is the key decision.
- Credits that can only buy Glide's electronically supplied service, sold B2B to a customer whose country is known, will often be an **SPV**. VAT is then due at issue, and for EU B2B that means reverse charge at sale.
- Credits usable across countries or VAT treatments, or resold through white-label chains, may be **MPVs**, where VAT arises only on redemption.
- In B2B cross-border sales the customer self-accounts for VAT ("btw verlegd", listed in the ICP return). OSS only matters for any B2C sales.
- Unused credits (breakage) are recognised under IFRS 15 in proportion to use, or when redemption becomes remote. Dutch GAAP RJ 270 has been brought closer to IFRS 15.

### Cited Findings
- Voucher Directive (EU) 2016/1065 has applied since 1 Jan 2019. An SPV is a voucher where the place of supply and the VAT due are known when it is issued; otherwise it is an MPV. SPV: VAT is due on issue and on each transfer. MPV: transfers are outside VAT, and VAT arises on the actual supply at redemption — [CMS](https://cms.law/en/int/publication/vat-entry-in-force-of-the-directive-regarding-the-treatment-of-vouchers-for-vat-purposes); [KMLZ](https://www.kmlz.de/en/VAT/Newsletter_17_2016)
- Belastingdienst: enkelvoudige doelvoucher → btw verschuldigd bij verkoop; meervoudige doelvoucher → btw pas bij inwisseling. Kortingsbonnen/waardebonnen are distinct (a discount right, not prepayment) — [Belastingdienst: Vouchers, zegels en waardebonnen](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/bijzondere_regelingen/vouchers-zegels-waardebonnen/vouchers-zegels-waardebonnen)
- CJEU C-68/23 (Finanzamt O) concerned digital credits redeemable only in Germany but sold through a cross-border chain of distributors. It is relevant to prepaid digital credits resold via intermediaries — the analogue of Glide's agency and white-label resale (search summary) — [VATabout](https://vatabout.com/cjeu-case-c-6823-digital-vouchers-and-vat-clarifying-the-line-between-single-and-multi-purpose-vouchers); [PwC DE](https://blogs.pwc.de/en/german-tax-and-legal-news/article/251523/prepaid-cards-or-voucher-codes-for-purchase-of-digital-content-in-an-online-shop-are-single-purpose-vouchers/); [CURIA](https://infocuria.curia.europa.eu/tabs/redirect/juris/document/document.jsf?text=&docid=284889&pageIndex=0&doclang=en&mode=req&dir=&occ=first&part=1)
- Belastingdienst B2B: services to a business in another EU state carry no Dutch VAT. The invoice says "btw verlegd", the supplier checks the customer's VAT ID, and the supply is reported in the VAT return and the ICP return — [Belastingdienst: diensten aan afnemers in andere EU-landen](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/goederen_en_diensten_naar_andere_eu_landen/btw_berekenen_bij_diensten/btw_berekenen_bij_diensten_aan_afnemers_in_andere_eu_landen)
- Electronic services are taxed where the customer lives or is established. Reverse charge does not apply to consumers, and B2C sales can be reported through the OSS return — [ZZP Nederland](https://www.zzp-nederland.nl/kennisbank/btw-digitale-diensten); [Your Europe OSS](https://europa.eu/youreurope/business/taxation/vat/one-stop-shop/index_nl.htm)
- IFRS 15 breakage: revenue is recognised in proportion to the customer's pattern of exercised rights if Glide expects to be entitled to breakage (constrained so that a significant reversal is not highly probable). Otherwise it is recognised when the chance of the customer using the rights becomes remote — [IFRS Community](https://ifrscommunity.com/knowledge-base/revenue-from-customers-unexercised-rights-breakage/); [PwC IFRS 15 software guide](https://viewpoint.pwc.com/dt/gx/en/pwc/industry/industry_INT/industry_INT/software/revenue-recognition-an-ifrs-15-guide.html)
- Dutch GAAP: the revised DAS/RJ 270 (revenue) narrowed differences with IFRS 15 — [Crowe Peak](https://www.crowe-peak.nl/en/news/news-accountancy-reporting/en-most-important-changes-in-revenues-das-270-and-work-in-progress-das-221/); [EY IFRS vs Dutch GAAP 2025](https://www.ey.com/content/dam/ey-unified-site/ey-com/nl-nl/technical/tax/documents/ey-ifrs-a-comparison-with-dutch-laws-and-regulations-en-20250619.pdf)

### Inferences
- **Glide sells credits directly to a Dutch agency.** Place of supply is NL and the rate is 21%, so the credits are probably an SPV. Charge 21% at purchase; nothing further is due on consumption.
  - To an agency in another EU state: the place of supply is that state (Art. 44) and VAT is reverse-charged. The voucher is arguably an SPV because the place is known, so reverse charge applies at issue.
  - To a non-EU agency: outside the scope of EU VAT.
- **White-label resale.** If an agency resells Glide credits to its own clients, possibly in other countries, the SPV test can fail, so the credits become an MPV (VAT at redemption only), or the reseller chain has to account for VAT at each transfer. C-68/23 is directly on point. **[TAX ADVISER]** Choose the structure deliberately.
  - Simplest: agencies buy credits for their own use and resell *their own service* (the agency's development service) to clients. Glide's credits then never pass down the chain as vouchers.
- **Voucher or advance payment?** Credits consumed per delivered ticket with metered usage may be better characterised as an **advance payment on a continuing service** (Art. 65 VAT Directive: VAT due on receipt of payment when the supply is sufficiently identified) than as a voucher. For an NL B2B supplier the result is similar: VAT at payment. **[TAX ADVISER]**
- **VAT on breakage.** For an SPV, VAT has already been paid on issue, so breakage raises no further VAT. For an MPV, unredeemed amounts are generally not subject to VAT in NL practice (general knowledge; verify).
- **Terms.** Include credit expiry (for example 12–24 months), a no-refund clause for unused credits, and conversion rules. Expiry supports breakage recognition. Under B2B law, expiry and forfeiture are enforceable if reasonable.
  - The Data Act's switching rules and the ban on switching charges from 2027 may constrain forfeiture on exit. **[LAWYER]**
- **Accounting.** Prepaid balances are a contract liability (deferred revenue). Recognise revenue per delivered ticket. Recognise breakage in proportion to use once there is historical cohort data; before that, only when redemption becomes remote, for example at expiry.
- **Principal or agent.** Model provider costs passed through at cost-plus are part of Glide's own service, so Glide is the principal. Glide should not present itself as reselling Anthropic or OpenAI tokens; check each provider's terms on resale.

### Gaps
- The full VATupdate 2026 explainer (blocked) and the full text of C-68/23 were not read. The exact holding needs confirming.
- No Belastingdienst guidance specific to SaaS usage credits was found.

## 5. Contract terms: white-label and reseller agreements, IP in AI-generated code, open-source contamination

### Takeaway
In the EU, purely AI-generated code likely has **no copyright**. Protection requires the programmer's "own intellectual creation" through free and creative choices, and prompts alone are not enough. Contracts therefore cannot rely on copyright to "transfer" ownership. They should instead assign whatever rights exist, license the rest, and set confidentiality and trade-secret rules. White-label agreements need to cover:
- brand licences;
- liability caps;
- AI Act, GDPR and CRA role allocation;
- support tiers;
- the AUP and model-provider flow-downs.

### Cited Findings
- EU standard: a computer program is protected only where its author made free and creative choices in how functionality is expressed (CJEU originality). On 13 Feb 2026 the AG München refused protection for AI-generated logos because neither the prompts nor iterative human edits showed enough creative control. Protection may arise where human creative elements "dominate" — [Dreyfus](https://www.dreyfus.fr/en/2026/06/18/ai-generated-software-is-your-code-really-protected-by-copyright/)
- EU copyright rests on human authorship: a "work" must be an original subject matter that is the author's own intellectual creation and is expressed identifiably. A simple prompt is not a creative contribution — [Bird & Bird, "AI Coding: can you protect what your agents create"](https://www.twobirds.com/en/insights/2026/belgium/ai-coding-can-you-protect-what-your-agents-create); [EPRS briefing](https://www.europarl.europa.eu/RegData/etudes/BRIE/2025/782585/EPRS_BRI(2025)782585_EN.pdf)
- The European Parliament adopted a resolution on copyright and generative AI, P10_TA(2026)0066, published in OJ C in 2026 — [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AC_202604006)
- NLdigital Voorwaarden 2025, used by more than 3,000 Dutch IT companies, add an AI module aligned with the AI Act. It bars using delivered software or data for training, TDM, scraping or model adaptation without permission. The cap for damage to property rose to EUR 1.75m, and data loss is no longer excluded as indirect damage — [NLdigital](https://www.nldigital.nl/kennis-producten/nldigital-voorwaarden-2025/); [ICTRecht](https://www.ictrecht.nl/blog/de-nldigital-voorwaarden-zijn-vernieuwd-wat-betekenen-ze-voor-jouw-it-organisatie); [Legalz](https://www.legalz.nl/blog/nldigital-voorwaarden-2025)
- Critics argue that customers should not accept NLdigital 2025 unchanged because it favours suppliers. Expect pushback from larger agencies — [BG.legal](https://bg.legal/nl/updates/waarom-je-als-afnemer-de-nldigital-voorwaarden-2025-niet-zou-moeten-accepteren)

### Inferences (checklist for **[LAWYER]** drafting)
- **IP clause.** Glide assigns to the customer (or the end-client via the agency) all rights, if any, in the outputs. Glide keeps its platform, prompts, agent configurations and "Glide Materials". It gets no rights in customer code except as needed to provide the service. It does not train on customer code. Agencies need matching terms in their client contracts so ownership flows through to the end-client.
- **Warranty disclaimer.** State plainly that outputs are AI-generated, may contain errors, security vulnerabilities or third-party material, and are "proposed changes for human review". Glide's own model (PRs ready for human review) supports this. The customer's merge decision is the point where it accepts the change.
  - Offer a narrow warranty on the *platform* (it performs substantially as documented), not on output quality.
  - Credits refunded or re-run for tickets that fail acceptance give a practical remedy.
- **Liability cap.** The market norm is fees paid in the previous 12 months. The NLdigital model caps at the contract price, or for longer contracts 6–12 months of fees, with absolute limits, and excludes indirect loss.
  - Under Dutch law, caps do not protect against **opzet or bewuste roekeloosheid** (intent or gross negligence) by management (settled case law; general knowledge).
  - Consider a super-cap for data-protection and confidentiality breaches, which customers will ask for.
- **IP indemnity.** Pass through the model providers' output IP indemnities where they exist. Some major providers offer copyright indemnity for commercial API outputs on conditions; check current Anthropic and OpenAI commercial terms, as this was not researched here. Do not give an uncapped indemnity beyond what upstream providers give Glide.
- **Open-source contamination.** Models can reproduce copyleft (GPL or AGPL) snippets verbatim.
  - Mitigations: licence and snippet scanning in the PR pipeline (SCA tools such as ScanCode, FOSSA or GitHub code-referencing filters), recording provenance in PR metadata, and a policy that the customer approves licences.
  - Contractually, the customer is responsible for its dependency and licence choices, and Glide commits to reasonable scanning.
  - SBOMs also support CRA duties for the self-hosted edition.
- **White-label specifics.**
  - Trademark licence both ways.
  - The agency is the first-line support provider; Glide is second-line with SLAs.
  - A "Powered by" or no-attribution option.
  - An **unremovable AI-interaction disclosure** (Art. 50).
  - A requirement that the agency's end-client terms include Glide's minimum flow-downs: AUP, no-training, data-processing terms, disclaimers and model-provider usage policies.
  - The agency indemnifies Glide for its client-facing promises.
  - Agencies set their own prices. Under EU competition law (Art. 101 TFEU / VBER 2022/720), Glide may not fix resale prices for credits, though maximum or recommended prices are allowed (general knowledge).
  - Audit rights on usage.
  - Anti-circumvention and non-solicit terms, which must be reasonable.
- **Model-provider terms.** Anthropic and OpenAI usage policies and commercial terms usually require customers to pass their AUPs downstream and may restrict competing-model development. Mirror these in the agency agreement.
- **Self-hosted licence.** Needs an EULA with a CRA support period, an update and vulnerability disclosure policy, licence metering and audit, and export-control terms. It also needs a statement of who the processor is: when self-hosted, Glide is not a processor unless it gets remote access.

### Gaps
- Dutch case law on AI-generated code specifically was not found.
- The current output IP indemnities of Anthropic, OpenAI and Mistral were not verified.

## 6. Consumer-law exposure (small-business end-clients) and Dutch algemene voorwaarden practice

### Takeaway
Glide's direct customers are businesses, so consumer law does not apply to them directly. Two exceptions to watch: under Dutch law, small businesses can rely on the consumer "black and grey lists" by **reflexwerking** (reflex effect), and any sole trader acting privately could be a consumer. Use NLdigital Voorwaarden 2025, or bespoke terms modelled on them, provided **correctly** to customers. Explicitly exclude consumers.

### Cited Findings
- The black list (art. 6:236 BW) and grey list (art. 6:237 BW) of unreasonably onerous clauses formally apply only to consumer contracts. Case law gives them *reflexwerking* for small businesses whose bargaining position is comparable to a consumer's — [Voorbeeldcontract.nl](https://www.voorbeeldcontract.nl/grijze-en-zwarte-lijst-reflexwerking-voor-kleine-ondernemingen/); [De Haij en van der Wende](https://www.haijwende.nl/nl/nieuwsberichten/algemene-voorwaarden-de-zwarte-en-grijze-lijst-bij-een-niet-consument/); [MKB Servicedesk](https://www.mkbservicedesk.nl/juridisch/algemene-voorwaarden/algemene-voorwaarden-zwarte-lijst)
- The NLdigital Voorwaarden 2025 are designed to work for sales to both small and large businesses — [NLdigital](https://www.nldigital.nl/kennis-producten/nldigital-voorwaarden-2025/); [inkijkexemplaar PDF](https://www.nldigital.nl/wp-content/uploads/sites/3/2025/10/Inkijkexemplaar-NLdigital-Voorwaarden-2025-NL.pdf)

### Inferences
- **Chain of contracts.**
  - Glide ↔ agency: B2B, governed by NLdigital or Glide terms.
  - Agency ↔ its client: governed by the agency's terms. Glide should supply minimum flow-down clauses rather than contract with end-clients directly.
  - If end-clients click through Glide-hosted portal terms, Glide may acquire a direct contractual relationship and liability. Make the portal legally the agency's, with Glide as processor or sub-processor, or use a tri-partite click-through. **[LAWYER]**
- **Providing terms.** Under Dutch law (art. 6:233–6:234 BW), terms must be provided (ter hand gesteld) before or at contract conclusion. Online, that means making them available electronically so they can be stored.
  - Referring to NLdigital terms "filed at the Chamber of Commerce" is not enough for small parties or online sales.
  - Clauses that are not properly provided can be annulled (vernietigbaar). This is general Dutch contract-law knowledge. Build a click-accept flow with a downloadable PDF.
- **Consumers.**
  - Restrict sign-up to businesses with a VAT or KvK number.
  - If consumers ever buy credits, the following apply: the 14-day withdrawal right (digital-content waiver rules), the Omnibus Directive price-transparency rules, the grey-list ban on some expiry clauses, and B2C VAT through OSS in the customer's country.
- **Dutch consumer and small-business developments.** No 2026 legislative proposal extending the black and grey lists to small businesses was found in this search.
- **Also relevant.** The Dutch "DBA" and freelancer rules do not apply. The EU Platform-to-Business Regulation (2019/1150) likely does not apply to Glide as a SaaS tool, since it is not an intermediation service to consumers.

### Gaps
- No up-to-date (2026) Dutch case law on reflexwerking for SaaS terms was reviewed.
- The full text of the NLdigital 2025 AI module was not read.
