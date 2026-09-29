# Fair, transparent and ethically explainable pricing for usage-based software (cost-plus-markup and pay-on-outcome), as of 2026

Method note: research done 2026-09-29. The egress proxy blocked direct fetches of almost every primary source (openrouter.ai, intercom.com, support.zendesk.com, ampcode.com, replit.com, buffer.com, advocatenblad.nl, the Kahneman/Knetsch/Thaler PDFs). **Unless stated otherwise, every finding below was seen only in search-result summaries**, not in the full primary page. Summaries of company pricing pages are often produced by third-party blogs; the report writer should treat specific numbers as "reported" and have them confirmed on the live page before quoting them to customers.

## 1. Frameworks for fair pricing

### Takeaway
The academic literature says a price is judged fair when (a) it stays close to a known *reference transaction*, (b) price changes are explained by the seller's *costs* rather than by the buyer's *need* or lack of choice, and (c) the *process* is visible and trustworthy. Cost-plus with a disclosed markup fits all three; hidden value-based surcharges do not.

### Cited Findings
- Kahneman, Knetsch and Thaler, "Fairness as a Constraint on Profit Seeking: Entitlements in the Market", *American Economic Review* 76(4), 728-741, September 1986, based on telephone surveys of community fairness standards — [ResearchGate](https://www.researchgate.net/publication/4900848_Fairness_As_a_Constraint_on_Profit_Seeking_Entitlements_In_The_Market) (search summary)
- Core finding: it is acceptable for a firm to raise prices when profits are threatened (costs rise) and to keep prices when costs fall; it is unfair to exploit shifts in demand by raising prices — [EconBiz record / abstract](https://www.econbiz.de/Record/fairness-as-a-constraint-on-profit-seeking-entitlements-in-the-market-kahneman-daniel/10005761609) (search summary)
- Dual entitlement principle: "transactors have an entitlement to the terms of the reference transaction and firms are entitled to their reference profit" — [Chicago Booth copy of the paper](https://faculty.chicagobooth.edu/-/media/research/cdr/docs/thaler/fairness-as-a-constraint-on-profit-seeking.pdf) (search summary; fetch blocked)
- Asymmetries: an action is more likely judged unfair if it imposes a loss on the customer than if it reduces a possible gain, and if it produces a gain for the firm rather than averting a loss — same source (search summary)
- Xia, Monroe and Cox (2004), "The Price Is Unfair! A Conceptual Framework of Price Fairness Perceptions", *Journal of Marketing* 68(4): define price fairness as "a judgment of whether an outcome and/or the process to reach an outcome are reasonable, acceptable, or just"; stress comparisons with similar other customers and the role of trust — [SAGE Journals](https://journals.sagepub.com/doi/10.1509/jmkg.68.4.1.42733); [Illinois Experts](https://experts.illinois.edu/en/publications/the-price-is-unfair-a-conceptual-framework-of-price-fairness-perc/) (search summary)
- A later model of antecedents of price unfairness perceptions (Bolton/Warlop/Alba lineage) is hosted by Jag Sheth — [PDF](https://www.jagsheth.com/wp-content/uploads/2015/12/Developing-a-model-of-antecedents-to-consumers-perceptions-and-evaluations-of-price-unfairness.pdf) (not read; listed only)
- Rotemberg, "Fair Pricing" (NBER w10915) formalizes customers punishing firms they believe act out of greed rather than cost — [NBER](https://www.nber.org/system/files/working_papers/w10915/w10915.pdf) (listed only, not read)

### Inferences
- Glide's model maps cleanly onto dual entitlement: the reference transaction is "the provider's list price for tokens", and the markup is Glide's reference profit. Customers accept a stable, disclosed markup; they resent a markup that rises when they are dependent (e.g., in the middle of a Shift, or when a ticket is urgent).
- The "process fairness" half of Xia/Monroe/Cox is where transparency pays off: showing the per-Run token count and provider price makes the process auditable, not just the final number.
- Loss-framing asymmetry argues for a *cap per ticket* (Glide already has one): an unexpected overrun is a "loss", which is judged much more harshly than a missed discount.
- Ethical contrast (inference, not sourced here): cost-plus is easy to justify ("we pass on costs plus a fixed share"); value-based pricing is harder to explain because the seller's share depends on how badly the buyer needs the result. Glide's delivery fee in credits is a mild, size-based value component; it is explainable because it is fixed per size (S/M/L), not negotiated per customer.

### Gaps
- Could not fetch the Kahneman et al. PDF, so the exact vignette percentages (e.g., the snow-shovel price-rise vignette) are **not verified** in this session and are left out deliberately.
- Did not find a citable B Corp standard specifically on pricing transparency; B Corp's assessment focuses on governance/workers/community, and I found no source saying it certifies price fairness.

## 2. Companies that publish costs and markups

### Takeaway
Precedents cluster around three patterns: (1) zero markup on pass-through cost with a disclosed platform fee (OpenRouter 5.5% on credit purchases; Amp 0% for individuals/teams, 50% for enterprise); (2) publish where each euro goes (Buffer, Everlane); (3) simple flat or single-rate prices so the customer need not reason about the meter (Basecamp, Backblaze, Cloudflare R2). Disclosed markups in AI routing are in the 0-6% range; retail "radical transparency" used roughly 2x cost against an 8-10x industry norm.

### Cited Findings
**OpenRouter (AI model routing)**
- Charges a 5.5% fee on credit purchases (minimum $0.80; 5% for crypto); provider token rates pass through with no token markup. A $100 purchase yields about $94.50 of credits — [TrueFoundry](https://www.truefoundry.com/blog/openrouter-pricing); [Amnic](https://amnic.com/blogs/openrouter-pricing); official page [openrouter.ai/pricing](https://openrouter.ai/pricing) (search summary; official page fetch blocked)
- Net effect: slightly more expensive than calling OpenAI directly because of the credit fee — [BetterClaw](https://www.betterclaw.io/blog/openrouter-vs-direct-api-agents) (search summary)

**Amp (Sourcegraph spin-out, coding agent)**
- Individual and non-enterprise usage passed through at provider API rates with zero markup; pay-as-you-go, $5 minimum credit purchase; pricing page example: $2 of Anthropic plus $0.50 of OpenAI usage deducts $2.50 of credits — [G2](https://www.g2.com/products/sourcegraph-sourcegraph/pricing); [Bitdoze](https://www.bitdoze.com/amp-code-free-ai-coding-agent/) (search summary)
- Enterprise adds a 50% markup and a $1,000 onboarding fee — [search summaries of third-party reviews, e.g. aitoolsatlas](https://aitoolsatlas.ai/tools/amp-code) (search summary; not verified on ampcode.com, fetch blocked)
- Amp spun out of Sourcegraph in December 2025 — same summaries (unverified)

**Devin (Cognition)**
- ACUs consumed in a failed session are not refunded — [fast.io ACU guide](https://fast.io/resources/devin-acu-guide/) (search summary; third party)
- Self-serve moved away from public ACUs toward quota plus on-demand usage "at API list prices"; enterprise still billed in ACUs per order form — [Devin Docs billing](https://docs.devin.ai/admin/billing); [usagebar](https://usagebar.com/blog/devin-pricing-and-rate-limits) (search summary)

**Buffer (open revenue, open salaries, transparent pricing)**
- Publishes "where your money goes" per subscription dollar: Salaries 72.97%, Hosting 7.18%, Tools 8.16%, Fees 3.98%, Marketing 3.30%, Taxes 2.83%, Retreats 1.57% — [Buffer: Where your money goes](https://buffer.com/resources/transparent-pricing-dashboard/); earlier version [Open Buffer, 2016](https://open.buffer.com/pricing-2016/) (search summary; date of the specific breakdown not verified)
- All salaries public since 2013, with a published formula — [Buffer open salaries](https://buffer.com/resources/introducing-open-salaries-at-buffer-including-our-transparent-formula-and-all-individual-salaries/) (search summary)

**Everlane (retail "radical transparency")**
- Showed line-item cost (materials, labor, transport, duties) plus its own markup; roughly 2x cost vs an 8-10x industry norm — [Harvard D3](https://d3.harvard.edu/platform-rctom/submission/everlane-winning-with-radical-transparency/); [Prisync](https://prisync.com/blog/everlane-pricing-strategy/) (search summary)
- Criticized for selective disclosure with limited third-party verification; reportedly acquired by Shein for about $100 million — [The Ethos](https://the-ethos.co/everlanes-radical-transparency-shein-bargain-buyout/) (search summary; acquisition not independently verified)

**Basecamp / 37signals (flat pricing)**
- $15 per seat, or unlimited users for $299/month billed annually ($349 monthly) — [Basecamp pricing](https://basecamp.com/pricing); [TechRepublic](https://www.techrepublic.com/article/basecamp-review/) (search summary)
- Jason Fried's rationale (REWORK podcast): flat pricing lets them say no to feature requests that don't fit, because no single customer's per-seat revenue dominates — [REWORK "Picking pricing"](https://37signals.com/podcast/picking-pricing/) (search summary)

**Backblaze B2 / Cloudflare R2 (simple, predictable infrastructure pricing)**
- Backblaze: one storage class (reported $6.95/TB/month in 2026; older sources say $6), free egress up to 3x stored data, no minimums — [Backblaze pricing](https://www.backblaze.com/cloud-storage/pricing); [comparestacks](https://comparestacks.com/developer-infrastructure/object-storage/details/backblaze-b2/) (search summary; the two prices conflict by source date)
- Cloudflare R2: zero egress fees on every storage class; pay only for storage and operations — [Mecanik](https://mecanik.dev/en/posts/cloudflare-r2-pricing-explained-real-costs-vs-s3-and-backblaze/) (search summary)

**Plausible / Oxide**
- Plausible: bootstrapped, 100% subscriber-funded, never raised investment; publishes revenue updates — [Plausible blog](https://plausible.io/blog/customers-not-investors); [Plausible about](https://plausible.io/about) (search summary)
- Oxide does *not* publish product prices (contact sales), but publishes uniform salaries and treats "trust as a product feature" — [Oxide: Compensation as a Reflection of Values](https://oxide.computer/blog/compensation-as-a-reflection-of-values); [Oxide's compensation model: how is it going?](https://oxide.computer/blog/oxides-compensation-model-how-is-it-going) (search summary)

### Inferences
- The closest precedents to Glide's token charge are OpenRouter (fee on top-up, 0% token markup) and Amp (0% for teams). A Glide markup noticeably above ~5-10% on raw tokens will be compared directly against these and needs an explicit justification (orchestration, retries, infrastructure). Amp's 50% enterprise markup shows a higher markup is tolerated when it buys something named (enterprise features/support) rather than hidden.
- Buffer's per-euro breakdown is a directly reusable format for Glide: "Of each €15 credit: X% goes to model providers, Y% to infrastructure, Z% to maintainers/salaries, W% margin."
- Everlane is a cautionary tale: transparency claims that are selective or unverifiable attract criticism. If Glide publishes cost, it should be computed from real metered data (the per-Run receipts) rather than illustrative estimates.
- Oxide shows that transparency about *values and costs* and transparency about *price* are separable; an open-source project can be transparent on both.

### Gaps
- Hetzner and Fly.io pricing philosophy were not researched (tool budget); no citable statements collected.
- Did not find a published survey of "what markup percentage customers consider fair" for software; the 0-5.5% AI-routing range and Everlane's 2x are precedents, not measured fairness thresholds.
- Cloudflare's own blog rationale for zero egress was not fetched.

## 3. Pay-on-outcome precedents: defining the outcome and handling disputes

### Takeaway
Every workable pay-on-outcome model defines the outcome mechanically (an observable event plus a waiting period), charges nothing for failed attempts, and has a clawback when the outcome later turns out false. Intercom and Zendesk both do this; Upwork adds an escrow with auto-release and mediation; Dutch no-cure-no-pay is regulated with caps and is permitted for lawyers only in narrow cases.

### Cited Findings
**Intercom Fin**
- $0.99 per outcome. A resolution is counted when, after Fin's last answer, the customer confirms satisfaction ("confirmed resolution") or leaves without requesting more help ("assumed resolution") — [Intercom help: Fin AI Agent outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes); [How Fin pricing works](https://www.intercom.com/help/en/articles/7837512-how-fin-pricing-works) (search summary; fetch blocked)
- Assumed resolution after about 24 hours of customer inactivity (third-party description) — [Macha](https://www.getmacha.com/blog/intercom-fin-pricing) (search summary)
- If a customer returns to the same conversation seeking further help, the resolution is deducted and not charged — [Intercom help](https://www.intercom.com/help/en/articles/7837512-how-fin-pricing-works) (search summary)
- Outcomes can also include "certain procedure handoffs" — same (search summary)

**Zendesk automated resolutions**
- The automated resolution is the billing unit for AI agents; for email/web form it is counted after 72 hours of inactivity if the AI gave a generative reply, the customer gave positive or no feedback, no human agent responded, and a separate LLM reviewed the transcript and confirmed relevance — [Zendesk help: About automated resolutions for AI agents](https://support.zendesk.com/hc/en-us/articles/8357756668186-About-automated-resolutions-for-AI-agents); [Robylon explainer](https://www.robylon.ai/blog/zendesk-automated-resolution-explained) (search summary)
- Zendesk now also has "automated resolution tiers" — [Zendesk help](https://support.zendesk.com/hc/en-us/articles/9570369117338-About-automated-resolution-tiers) (listed only; not read)

**Upwork fixed-price milestones (escrow)**
- Client funds milestone in escrow; after the freelancer clicks Submit Work, the client has 14 days to approve or request changes; no action counts as approval and funds auto-release (followed by a 5-day security hold) — [Upwork support: milestones](https://support.upwork.com/hc/en-us/articles/211063718-How-payments-for-milestones-and-fixed-price-contracts-work); [GigRadar](https://gigradar.io/blog/upwork-payment-protection-fixed-price) (search summary)
- Disputes go to Upwork mediation; if that fails, paid arbitration — [Upwork dispute process](https://www.upwork.com/resources/upwork-dispute-process) (search summary)

**Dutch "no cure no pay" (resultaatgerelateerde beloning)**
- Dutch lawyers are generally barred from pure result-based fees (Verordening op de advocatuur, art. 7.4), except personal injury and death cases; experiment since 2014 (a 2004 trial proposal preceded it) — [NOvA](https://www.advocatenorde.nl/voor-advocaten/toegang-tot-het-recht/resultaatgerelateerde-beloning-bij-letselschade-overlijdensschadezaken); [nl.wikipedia](https://nl.wikipedia.org/wiki/No_cure,_no_pay) (search summary)
- Made permanent from 1 January 2026 for personal injury/death cases — [Advocatenblad, 30 Sept 2025](https://www.advocatenblad.nl/2025/09/30/no-cure-no-pay-definitief-toegestaan/); [NOvA news](https://www.advocatenorde.nl/nieuws/resultaatgerelateerde-beloning-bij-letsel-en-overlijdensschadezaken-definitief-vastgelegd-in-de-regelgeving); [Advocatie](https://www.advocatie.nl/nieuws/resultaatgerelateerde-beloning-bij-letselschadezaken-definitief-toegestaan/) (search summary)
- Fee may not exceed 25-35% of the result; purpose is access to justice — same sources (search summary; exact cap structure not verified)
- The ACM closed an old competition file on the lawyers' no-cure-no-pay ban in 2018 — [ACM](https://www.acm.nl/nl/publicaties/acm-sluit-oud-dossier-over-verbod-op-no-cure-no-pay-voor-advocaten) (search summary)
- Outside the Bar, "no cure no pay" is a common and unregulated commercial term in NL (e.g. claims agencies, recruiters, salvage) — [nl.wikipedia](https://nl.wikipedia.org/wiki/No_cure,_no_pay) (search summary)

**Attribution disputes in outcome pricing (industry commentary)**
- Outcome pricing is vulnerable to attribution disputes (was the gain due to the AI or to people/other systems?), which turns renewals adversarial; Stripe reportedly advises defining attribution rules up front — [Steven Forth, Failure patterns in AI agent pricing](https://pricinginnovation.substack.com/p/failure-patterns-in-ai-agent-pricing); [Chargebee playbook](https://www.chargebee.com/blog/pricing-ai-agents-playbook/) (search summary; Stripe guidance not traced to primary)
- "Charging for failed work is equivalent to charging for harm" and triggers trust breakdown — same commentary (search summary; opinion)

### Inferences
- Glide's outcome ("the agency accepts/merges the resulting pull request") is unusually clean compared to support resolutions: it is an explicit human action recorded by GitHub, not an inferred silence. That removes most attribution risk. Two edge cases to define: (1) PR accepted after heavy human rework (is that a delivery?), (2) PR merged then reverted within N days (clawback, like Intercom's deduction on return).
- Neither Intercom nor Zendesk charges on silence without a check; Glide should not auto-bill a PR that sits un-reviewed. If an auto-release rule is ever used (Upwork-style), it must be announced, long (Upwork: 14 days), and reversible via dispute.
- Dutch no-cure-no-pay precedent: society accepts result fees when they are capped and disclosed; the Bar's rules also show the concern that result fees can create incentives to overreach. The Glide analogue: the delivery fee is fixed by size, not a percentage of value, which avoids the "share of your outcome" critique.

### Gaps
- No primary source for "Sourcegraph pay-per-merged-change"; I found no evidence Sourcegraph/Amp charges per merged change. Amp is pass-through usage pricing. Treat that precedent as **unconfirmed / probably nonexistent**.
- Intercom/Zendesk dispute workflows (can a customer contest a billed resolution?) were not found beyond the return-deduction rule.
- The exact tiered cap percentages for Dutch personal-injury lawyers (25% vs 35% conditions) not verified.

## 4. Should failed attempts be charged?

### Takeaway
Market evidence splits by who controls the effort. Where the vendor's agent decides how much work to do, charging for failures provokes backlash (Replit); where the customer drives usage, pass-through charging of all tokens is accepted (OpenRouter, Amp, Devin do not refund failed sessions). Outcome-priced products (Intercom, Zendesk) charge nothing for failures. Glide's hybrid (tokens at cost for every attempt, capped; margin-bearing fee only on acceptance) matches the ethically defensible middle: the customer covers real out-of-pocket cost, the vendor earns profit only on success.

### Cited Findings
- Replit's "effort-based pricing" billed per checkpoint whether the operation succeeded, hung or errored; users reported paying $1.15 for a non-existent method suggestion, credits draining while the agent looped on its own bugs, 3-4x cost increases, and a $350 day — [usecarly](https://www.usecarly.com/blog/replit-agent-pricing-explained/); [InfoWorld](https://www.infoworld.com/article/4059876/replit-update-sparks-developers-dissatisfaction-over-pricing.html) (search summary)
- The Register reportedly documented users at about $1,000/week after Agent 3 (vs $180-200/month), and a $20 single prompt when the agent redesigned a UI it was not asked to change — cited via [usecarly](https://www.usecarly.com/blog/replit-agent-pricing-explained/) (search summary; The Register article not fetched)
- Dates conflict in summaries: one says effort-based pricing began "mid-2024" and reached existing subscribers "July 1, 2026"; InfoWorld's article ID suggests September 2025 coverage. **Unresolved**; my recollection (unverified this session) is launch around June 2025 with Agent 3 in September 2025 — [Replit blog recap](https://replit.com/blog/effort-based-pricing-recap) (fetch blocked)
- Devin: ACUs used in failed sessions are not refunded — [fast.io](https://fast.io/resources/devin-acu-guide/) (search summary; third party)
- Zendesk and Intercom: zero charge for failed attempts under outcome pricing — [flexprice](https://flexprice.io/blog/why-ai-companies-have-adopted-usage-based-pricing) (search summary)
- Legal "no cure no pay" in NL means no fee without result, though clients may still bear disbursements in some arrangements — general description at [justitia.nl](https://www.justitia.nl/no-cure-no-pay) (search summary; disbursement detail not verified)

### Inferences
- Ethical argument for charging tokens on failure: tokens are a real third-party cost incurred at the customer's request (they chose the ticket); passing them on at cost is not profit from failure. Argument against: Glide controls prompt quality, retries and stopping rules, so failures are partly Glide's fault; charging them removes Glide's incentive to stop early. The per-ticket cap is the answer to the second argument, because it bounds Glide's "moral hazard."
- Strengthening options (proposed, not sourced): (a) no markup on tokens for attempts that end in a platform error (crash, timeout, infra failure) versus a model that tried and failed; (b) refund or credit tokens when a Run fails for a reason attributable to Glide; (c) show the stopping rule in advance ("we stop after N attempts or €X").
- Replit's lesson: the backlash came from unpredictability (price known only after the run) and paying for the agent's own loops. Glide should show an estimate and the cap *before* a Shift starts.

### Gaps
- No survey data found on the share of B2B buyers who accept paying for failed AI attempts.

## 5. How to present the price so it is explainable

### Takeaway
The strongest precedents show (a) the pass-through cost and the fee as separate lines (OpenRouter, Amp's worked example), (b) a per-euro breakdown of where money goes (Buffer, Everlane), and (c) a simple, bounded headline (Basecamp flat fee, Backblaze single rate). A per-ticket receipt combining these is the natural Glide format.

### Cited Findings
- Amp's pricing page uses a worked example: $2 Anthropic + $0.50 OpenAI usage = $2.50 deducted — [G2 summary](https://www.g2.com/products/sourcegraph-sourcegraph/pricing) (search summary)
- OpenRouter frames it as "$100 buys ~$94.50 of inference credits" — [TrueFoundry](https://www.truefoundry.com/blog/openrouter-pricing) (search summary)
- Buffer's per-dollar pie of costs — [Buffer](https://buffer.com/resources/transparent-pricing-dashboard/) (search summary)
- Everlane's infographic per product: materials, labor, transport, duties, margin, versus traditional retail price — [Harvard D3](https://d3.harvard.edu/platform-rctom/submission/everlane-winning-with-radical-transparency/) (search summary)
- Replit complaint: users could not see a price before committing — [usecarly](https://www.usecarly.com/blog/replit-agent-pricing-explained/) (search summary)

### Inferences (proposed wording and formats for Glide; not sourced claims)
- Headline: "You pay what the model costs us, plus [X]%, never more than [cap] per ticket. You pay the delivery fee only when you accept the pull request."
- Per-ticket receipt (proposed):
  - Work Item #123, size M
  - Runs: 4 (planner 1, implementer 2, reviewer 1); Shift outcome: PR accepted
  - Model tokens: 1.84M in / 212k out at provider list price = €4.10
  - Glide markup [X]% = €0.41 (covers orchestration, retries, hosting)
  - Cap for this ticket: €[cap]; you used [n]%
  - Delivery fee: 3 credits (M) = €45, charged because you accepted PR #456 on [date]
  - Total: €49.51
  - "If you had rejected the PR you would have paid €4.51."
- "What you pay for" block: "Tokens are our cost, passed through. The markup keeps the lights on. The delivery fee is our profit, and we only earn it when you are satisfied enough to accept the work."
- Show the per-euro split of the delivery fee in Buffer style once real numbers exist, computed from actual data (avoid Everlane's unverifiable-estimate criticism).
- Before a Shift: show the estimated token cost range and the hard cap (answers Replit's "no price before committing" complaint).
- Publish the markup percentage and a changelog of any change with notice (dual entitlement: changes justified by cost are accepted; unexplained increases are not).

### Gaps
- No example pricing pages were fetched in full (all blocked), so page layouts could not be inspected directly.

## 6. EU/NL legal constraints for B2B price transparency and prepaid credits (brief)

### Takeaway
In B2B, Dutch general terms and conditions are tested for being "unreasonably onerous" (art. 6:233 BW); the consumer black/grey lists don't apply directly but influence the test for small businesses. Prepaid credits usable only for the issuer's own services generally fall outside e-money/payment licensing via the limited-network exclusion, but this is fact-specific. Consumer-only rules (Omnibus price indications, 14-day withdrawal) don't bind a B2B-only offer.

### Cited Findings
- Art. 6:233-6:237 BW: clauses in general terms can be annulled if unreasonably onerous; black/grey lists (6:236, 6:237) do not apply directly to B2B, but the general test does and small businesses get some protection — [Maak Law](https://www.maak-law.com/contract-law-netherlands/forbidden-terms-and-conditions-in-netherlands-contracts/); [law-firm.nl](https://law-firm.nl/dutch-law-on-unfair-contract-terms.html) (search summary)
- PSD2 limited network exclusion covers instruments usable only to acquire goods/services from the issuer or a limited network; technical and contractual restrictions required cumulatively; notification to the regulator when payment transactions exceed EUR 1 million (art. 37(2)) — [Schoenherr](https://www.schoenherr.eu/content/limited-network-exemption-under-psd2-eba-consults-on-draft-guidelines); [EBA Guidelines EBA/GL/2022/02](https://www.bde.es/f/webbde/INF/MenuHorizontal/Normativa/guias/EBA-GL-2022-02-EN.pdf); [Loyens & Loeff](https://www.loyensloeff.com/insights/news--events/news/eba-guidelines-on-the-limited-network-exclusion-under-psd2/) (search summary)
- Omnibus Directive implementation in NL (consumer-facing price indication rules) — [Bird & Bird](https://www.twobirds.com/en/trending-topics/omnibus-directive/omnibus-directive-countries/netherlands) (listed; consumer scope)
- Dutch payment term legislation for B2B (e.g. statutory payment terms) — [CMS expert guide](https://cms.law/en/int/expert-guides/cms-expert-guide-to-payment-term-legislation/netherlands) (listed only)

### Inferences
- Credit expiry: no source found on B2B prepaid-credit expiry specifically. A short expiry or forfeiture of paid credits is the clause most likely to be challenged as unreasonably onerous against a small agency; a transparent choice is "credits don't expire" or "refund unused credits on request/at account closure."
- Keep credits spendable only on Glide (no transfer, no cash-out) to stay within the limited-network exclusion; the EUR 1 million notification threshold is unlikely to matter early.
- If Glide ever sells to sole traders or consumers, consumer rules (price display incl. VAT, withdrawal rights, Omnibus) apply; quote B2B prices excl. VAT and say so.

### Gaps
- No authoritative source found on Dutch case law about expiring prepaid credits in B2B; needs a Dutch lawyer's opinion.
- EU Data Act (switching charges) and PSD3/PSR changes were not researched; PSD3 may alter the limited-network regime ([Timelex](https://www.timelex.eu/en/blog/psd3psr-are-way-what-changes-e-money), listed only).
