# Agency pricing strategy

Status: proposal, 2026-09-29. Synthesized from five research notes: [competitors](evidence/2026-09-29-agency-pricing/competitors-and-white-label.md), [usage-based pricing](evidence/2026-09-29-agency-pricing/usage-based-pricing-practice.md), [agency economics](evidence/2026-09-29-agency-pricing/agency-market-economics.md), [cost base](evidence/2026-09-29-agency-pricing/cost-base.md), [legal and tax](evidence/2026-09-29-agency-pricing/legal-eu.md). Every external figure comes from search-result summaries because page fetches were blocked; verify before publishing. Nothing here is decided: each recommendation is a question for the owner. It revises the [pricing units record](2026-09-28-pricing-units.md) and [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md).

## Price the delivered ticket, not the token

Glide should keep the founder's shape (credits, S/M/L tickets charged only on delivery, hard caps before spend) and the €15 list credit. It should change four things. First, plan on a **55% delivery rate, not 70%**. Second, price L at **10 credits instead of 8**. Third, set a **hard floor of €12 per credit** that no discount, channel or founding deal can breach. Fourth, define "delivered" as **accepted by the agency's reviewer**, not merely "review-ready". At those settings Glide earns roughly **75% expected gross margin** on ticket credits and keeps **at least ~30% even if every attempt burns its full cap**. That is well above the 45-53% typical of AI products. The agency case is stronger than the founder's numbers suggest, but it hinges on delivery rate. Reselling an S ticket at about €150 beats hourly billing per senior hour only once delivery passes roughly **61%**, or when the agency returns undelivered tickets to the client at no charge instead of finishing them by hand at the fixed price. That makes €150 close to the right client price, not a high one: at €125 the agency needs about 79% delivery to beat hourly work. Go to market with a four-edition price book (Freelancer, Agency, White-label, Enterprise self-hosted). Sell first to Dutch dev-heavy agencies of 5-80 FTE that already sell *strippenkaarten* (prepaid bundles of hours) and maintenance contracts, and reach them through Dutch Digital Agencies, Emerce and the Simplicate/Teamleader ecosystem. Position against the effort-billed agents whose surprise bills dominate user complaints. Run a 90-day plan in which the first gate is *measured* delivery rate, not signups. **Caveat:** every external figure below comes from search-result summaries, because page fetches were blocked. Treat model prices, benchmark scores and market statistics as "reported, verify before publishing"; the last section lists the ones that matter most.

## The founder's €15 credit survives, but 70% delivery and the 8-credit L do not

Glide's cost of a delivered ticket is set by three numbers: token cost per Shift, the delivery rate, and the cap that bounds failed attempts. The research supports the token side of the founder's model. One agent coding task pushes **400K to 2M cumulative input tokens**, mostly cache reads, and costs about **$0.54 for a bug fix and $2.28 for a feature-sized task** on Sonnet-class models ([Morph](https://www.morphllm.com/claude-code-api-cost)). Reported September 2026 prices are **$2/$10 per million tokens for Sonnet 5 and GPT-6 Sol and $4/$20 for Opus 5.5**, with cached input at 0.1x ([BenchLM](https://benchlm.ai/anthropic/api-pricing); [Requesty](https://www.requesty.ai/blog/gpt-6-sol-luna-pricing-release-api)). EU-region endpoints add **about 10%** ([aliteq](https://aliteq.com/eu-data-residency-ai-api-cost-2026)). A writer Run, a reviewer Run and one fix round therefore cost roughly **$1-1.5 for an S Shift, $3-4 for an M and $8-12 for an L** on the default tier, and about double that on Opus. These are extrapolations from per-task figures, not measurements. The founder's **€4 S cap** leaves 2.5-4x headroom on Sonnet-class models but only about 1.5x on Opus, so it is sound for the default tier and tight for premium models.

The delivery rate is where the founder's model is too optimistic. Top models score **about 80% on SWE-bench Pro** ([Morph SWE-bench Pro](https://www.morphllm.com/swe-bench-pro)). METR found that real maintainers merged about **24 percentage points fewer AI PRs than the automated grader accepted** ([METR](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)). Subtracting one from the other gives a realistic **~55% mergeable rate for well-scoped tickets**, lower for large ones, and **35-40% for open-weight models**. The closest commercial analogue, Intercom Fin's per-resolution pricing, runs at about **65% resolution** ([Cognitive Revolution](https://www.cognitiverevolution.ai/the-customer-service-revolution-building-fin-with-eoghan-mccabe-fergal-reid-of-intercom/)). Seventy percent is a plausible *target* for tickets that pass refinement triage. It is not a planning assumption until Glide has measured it.

The table converts these inputs into Glide's cost per delivered credit. "Worst case" assumes every failed and successful Shift spends its full cap. That is the number the floor price must survive, because delivery-only charging puts failed-attempt cost on Glide ([Sourcegraph](https://sourcegraph.com/blog/agentic-batch-changes-pricing) is the only coding-agent vendor found that does the same).

| Ticket | Credits (recommended) | Cap (default tier) | Planning delivery rate | Expected token cost per delivered ticket | Worst case per delivered ticket | Worst case per credit |
|---|---|---|---|---|---|---|
| S | 1 | €4 | 55% | ~€2.5 | €7.3 | €7.3 |
| M | 3 | €10 | 50% | ~€7.7 | €20 | €6.7 |
| L | **10** (founder: 8) | €25 | 40% | ~€27.5 | €62.5 | €6.3 (€7.8 at 8 credits) |

*Model estimates by this report. Token costs are treated as roughly EUR = USD with the 10% EU-residency uplift included. Add about €1 per ticket for the refinement Run, in-ticket CI, preview time and billing fees.*

Two conclusions follow. The **1/3/8 ratio matches the token-cost ratio but ignores that delivery falls as tickets grow**, so L becomes the loss-making size under stress. Moving L to 10 credits restores parity. The alternative is to keep 8 credits, tighten the cap to €20, and require anything bigger to be split, which [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md) already contemplates when a Shift hits its cap. Second, **€15 per credit is the right list price for now**. At 55% delivery it yields about 77% expected gross margin on an S ticket and about 45% in the all-caps-hit worst case. ICONIQ reports AI product gross margins of **45% in 2025, expected 52-53% in 2026** ([SaaStr on ICONIQ](https://www.saastr.com/the-execution-era-of-ai-5-key-takeaways-from-iconiqs-state-of-ai-report)), so Glide sits above the category even when stressed. Raising the price is tempting on value, since an S ticket replaces €150-300 of hourly billing. It is capped from above by substitutes. A strong-model Copilot agent session costs **$6-12 in credits** ([daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl)), and Claude Code averages about **$6 per developer per day** ([Anthropic via Finout](https://www.finout.io/blog/claude-code-pricing-2026)). Per *delivered* unit, €15 is already comparable to Copilot's $11-22 per merged result at 55% delivery. Glide's premium is predictability and the agency layer, not cheaper tokens.

## A four-edition price book with a €12 floor and delivery defined as acceptance

The recommended structure follows the 2026 convention of **a platform fee that includes a matching amount of usage**, as with Vercel Pro ($20 including $20 of credit) and Railway ([Flexprice](https://flexprice.io/blog/vercel-pricing-breakdown); [DEV](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p)). On top of that fee sit credit packs with volume discounts and metered usage protected by default-on caps. Hybrid subscription-plus-usage pricing is now the majority pattern: **85% of Metronome's respondents have a usage component**, and credit-based pricing **grew 126% in 2025** ([Metronome](https://metronome.com/state-of-usage-based-pricing-2025); [Growth Unhinged](https://www.growthunhinged.com/p/the-state-of-b2b-monetization-in-2026)). Agencies will recognise the model.

### Editions and recommended prices

| Edition | Monthly fee (recommended, range) | Included credits | Credit price | What it adds |
|---|---|---|---|---|
| Freelancer | **€49** (€39-59) | 3 | €18 pay-as-you-go, no volume discount | 1 seat, up to 3 client portals, Glide-branded portal, metered previews |
| Agency | **€349** (€290-390) | 20 | €15 list, volume discount down to €12 | Unlimited seats, up to 25 client portals, per-client wallets and budgets, reporting, Simplicate/Teamleader export |
| White-label | **€890** (€790-990) | 50 | €14 wholesale, down to €12 | Own domain and brand, the agency bills its clients through its own Stripe or Mollie, retail price tables per client, optional "Powered by", second-line support SLA |
| Enterprise self-hosted | **From €24k per year** (€18-60k) | Up to 1,500 delivered tickets per year | Bring your own model keys; **€3-5 platform fee per delivered ticket** above the band | Kubernetes install, EU-only routing, SSO, CRA-grade update and vulnerability policy, audit-metered licence |

Annual prepayment earns two months free on the platform fee (about 17%), in line with Duda's 20-24% annual saving ([Duda pricing](https://www.duda.co/pricing)). The White-label fee sits above Duda's **$149 white-label tier** and GoHighLevel's **$297/$497 split**, where markup rebilling is reserved for the higher tier ([SwitchToGHL](https://switchtoghl.com/ghl-saas-mode)). The premium is justified because Glide's tier includes €700 worth of credits and delivers billable development work, not a site builder. The self-hosted edition prices the platform, not the tokens: the customer pays its model provider directly, and Glide charges roughly what is left of a credit after model cost. OpenHands keeps self-hosting behind custom enterprise pricing and discontinued its mid-tier plan ([OpenHands](https://www.openhands.dev/pricing)), so a published starting price is itself a differentiator.

### Volume discounts (staffelkorting) and the floor

| Monthly committed credits or prepaid pack | Price per credit | Discount off €15 |
|---|---|---|
| Under 100 | €15 | 0% |
| 100-249 | €14 | 7% |
| 250-499 | €13 | 13% |
| 500 and above | **€12 (floor)** | 20% |

The ladder tops out at 20%, inside the **10-25% committed-spend range Twilio grants** and the **25% committed-versus-PAYG spread Zendesk uses for outcome pricing** ([Automation Atlas](https://automationatlas.io/answers/twilio-pricing-explained-2026/); [Zendesk](https://www.zendesk.com/newsroom/articles/zendesk-outcome-based-pricing/)). The **€12 floor is derived, not negotiated**: worst-case cost per delivered credit (about €7.3 plus €1 overhead) divided by 0.70 guarantees at least 30% gross margin if every Shift hits its cap at 55% delivery, and about 70% at expected costs. Five rules keep it intact:

- Discounts never stack below €12 for default-tier tickets, in any edition or channel, including white-label wholesale and founding customers.
- Premium-model tickets (Opus-class) consume **2x credits**, like GitLab's runner cost factors ([GitLab](https://about.gitlab.com/pricing/)), so the floor holds per unit of cost.
- Metered usage is never discounted.
- Founding customers get a 12-month price lock and extended rollover instead of a deeper discount.
- The floor is recomputed each quarter as measured p90 cost per delivered credit divided by 0.70, and published in the terms so it is not an ad-hoc concession.

Referral partners earn 10-15% of first-year revenue, within the **8-20% band** paid by WP Engine, Webflow and Lovable ([WP Engine](https://wpengine.com/agency-partner-program/); [Webflow](https://help.webflow.com/hc/en-us/articles/33961415802003-Webflow-Certified-Partner-program); [Lovable](https://lovable.dev/partners)).

Purchased packs are valid for **12 months**, the market default set by OpenAI and Anthropic prepaid credits ([OpenAI terms](https://openai.com/policies/service-credit-terms/)). Included monthly credits roll over for **one month only**. Unused *purchased* credits are refunded pro rata when a customer switches away. That position is fair, costs little, and pre-empts the Data Act's **ban on switching charges from 12 January 2027** ([Alston & Bird](https://www.alston.com/en/insights/publications/2025/09/eu-data-act-switching-requirements-cloud-services)).

### What "delivered" means

Charging on a "review-ready" PR, as ADR-0006 currently proposes, would make the agency pay for PRs its reviewer rejects, exactly the gap METR measured. Borrow the four-part structure of successful outcome pricing instead: a precise outcome, free failures, a reversal window, and a fee underneath ([Intercom](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes)). **A ticket is delivered when its PR is open against the agreed branch, required checks are green, the preview environment is healthy, the reviewer Verdict meets the client's Acceptance Conditions, and the agency's human reviewer approves or merges it.** If the reviewer takes no action within **10 business days**, the ticket auto-accepts, so reviewers cannot hold PRs open indefinitely to avoid the charge. A delivered ticket is **reversed within 14 days** if it is reverted for a defect inside its accepted scope. A Shift that hits its cap, fails, or is closed unmerged for an in-scope reason charges nothing. Abuse, such as copying the diff and closing the PR, is handled by monitoring the closed-unmerged rate per account, with a fair-use clause, rather than by charging earlier.

### Metered usage for what the customer controls

| Meter | Recommended rate | Included | Rationale |
|---|---|---|---|
| Tokens outside tickets (ad-hoc agent sessions, refinement beyond the allowance) | Provider list price × 1.25, shown in euros | Refinement allowance of €5 of spend per active client portal per month | Covers the EU-residency uplift and billing. ADR-0007 already flags refinement abuse |
| CI minutes (Glide-hosted Linux) | **€0.008/min** | The agent's own CI inside a ticket | Between GitHub's ~$0.006 and GitLab's $0.01 ([GitHub](https://github.com/resources/insights/2026-pricing-changes-for-github-actions); [GitLab](https://about.gitlab.com/pricing/)) |
| Preview environment-hours (small) | **€0.06/hour** (€0.05-0.10) | 7 days per delivered ticket, sleeping when idle | Estimated cost about €0.02-0.05/hour on Hetzner after the June 2026 increases ([Hetzner](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)) |
| Storage | **€0.10/GB-month** above 25 GB | 25 GB | Near Supabase's $0.125/GB disk rate ([Flexprice](https://flexprice.io/blog/supabase-pricing-breakdown)) |

Nothing inside a ticket is metered per event. Netlify's per-deploy credits show how high-frequency, low-value charges drain an allowance before the customer sees value ([Flexprice](https://flexprice.io/blog/complete-guide-to-netlify-pricing-and-plans)).

### Caps that are on by default

The trust evidence is one-sided. The worst incidents share the same traits: no default cap and unclear communication. They include the **$104,500 Netlify DDoS bill** ([Hacker News](https://news.ycombinator.com/item?id=39520776)), Cursor's apology and refunds after its 2025 credit change ([TechCrunch](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/)), and Copilot bills reportedly jumping **from $50 to $3,000** before GitHub added a spending limit on 2026-07-02 ([daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl)). Platforms with caps on by default, such as Supabase Pro and the GitHub Actions $0 limit, avoid those stories ([Supabase](https://supabase.com/docs/guides/platform/billing-faq)). Glide should ship these defaults:

- **Per-ticket Shift caps**: €4 for S, €10 for M, €25 for L at the default tier. Ploeg enforces them before spend, they cannot be disabled, and reaching one stops the Shift and offers a split.
- **Per-client monthly budget**: the agency sets it at onboarding and the client sees it in the portal. Every ticket also needs client approval of its price.
- **Account cap on metered usage**: €100 per month by default (€25 on Freelancer), with alerts at 50/75/90/100%, the pattern Vercel adopted ([Vercel](https://vercel.com/docs/spend-management)). At the cap, previews sleep rather than being deleted, ad-hoc sessions stop, and prepaid tickets already in progress finish. Only the account owner can raise it.
- **Preview hygiene**: previews sleep after 30 minutes idle and are deleted 7 days after the PR is merged or closed.

These caps must live in Ploeg's admission path, because billing systems rate usage after the fact.

## Agencies roughly double margin per senior hour, and clients pay less than an hourly quote

The agency proposition rests on a structural fact. Dutch agencies bill about **€105 per hour** (Q3 2025, about 550 agencies), face client pushback as rates near **€150-160**, and are productive only about **55% of the time** ([Emerce/Simplicate](https://www.emerce.nl/nieuws/105-euro-per-uur-helft-tijd-nietproductief); [Emerce rates 2025](https://www.emerce.nl/nieuws/onderzoek-tarieven-digital-agencies-tariefgrens-schuift-hogere-prijzen-stuiten-klantkritiek)). Margin cannot come from rate. It has to come from fixed-price work whose cost falls. The surveys show the winners already do this: agencies with the largest margin gains **kept prices steady while AI cut production time**, and only **13% actually cut prices** despite about a third receiving "AI discount" requests ([Productive pulse](https://productive.io/reports/agencies-in-the-ai-era-pulse-report/); [Productive](https://productive.io/blog/agencies-in-the-ai-era/)). Dutch research expects a shift to result-based pricing, but **nearly 40% of agencies do not yet know how** ([Emerce](https://www.emerce.nl/nieuws/onderzoek-invloed-ai-digital-agencies-kosten-kunnen-verviervoudigen)). Glide should sell that "how".

The model below compares one S ticket, a small change a developer would bill at about 2 hours. Its assumptions are this report's, not sourced: a loaded developer cost of €50 per hour worked, 30 minutes of review and 15 minutes of client handling per Glide ticket, and €1 of metered usage.

| Route (S ticket) | Client pays | Agency cost | Agency margin | Senior hours | Margin per senior hour |
|---|---|---|---|---|---|
| Hourly, 2 h × €105 | €210 (estimate, can overrun) | €100 | €110 | 2.0 | **€55** |
| Glide, delivered at €150 | €150 fixed | €53.50 | €96.50 | 0.75 | **€129** |
| Glide at €150, blended at 55% delivery, failures finished by hand | €150 | – | €70 | 1.43 | **€49** |
| Glide at €150, blended at 55% delivery, failures returned uncharged | €150 × 55% | – | €47.50 | 0.53 | **€90** |
| Glide at €150, blended at 70% delivery, failures finished by hand | €150 | – | €79 | 1.20 | **€66** |

The pattern is clear. A delivered ticket earns the agency more than twice as much per senior hour as hourly work. The client pays **about 30% less** than the hourly estimate and knows the price in advance. The risk is the failure path. An agency that promises a fixed €150 and then finishes failed tickets by hand beats hourly only above about **61% delivery**. At a €125 client price the break-even rises to about **79%**. The founder's €150 is therefore not greedy: it is roughly the lowest client price at which the promise works at today's delivery rates. The strategic consequence is that **agencies should resell only tickets the refinement Run marks as agent-ready**. When a Shift fails, their default should be to re-scope the ticket or return it uncharged, not to absorb it at a fixed price. Glide should publish a *recommended* retail band of **S €95-150, M €300-450 and L €900-1,400**, framed against the hourly equivalent (S about 1-2 h, M about half a day, L about 1-2 days).

The strippenkaart is the bridge. Dutch agencies already sell prepaid bundles of **10-100 hours, deducted in 15-minute blocks and valid for a year** ([Custom Website](https://www.customwebsite.nl/website-onderhoud/strippenkaart/)). Replacing it with a "ticketkaart" priced per change keeps the client's mental model and moves the efficiency gain from the client's hour count to the agency's margin.

Fairness to the end client needs explicit rules, not just a lower price:

- The client sees the size and fixed price and approves them before any spend ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)).
- The client pays only on delivery, and never more than the quote.
- A failed ticket is never quietly converted to hourly billing without the client's consent.
- A per-client monthly budget is visible in the portal.
- Previews let non-technical clients sign off on real behaviour.
- AI involvement is disclosed. This disclosure is required by law from August 2026 and cannot be removed in the white-label edition.

Glide may *recommend* or cap retail prices but must not fix them. Resale price maintenance is prohibited under Art. 101 TFEU and the vertical block exemption. That is a legal constraint, and it also means fairness has to be designed into the defaults rather than imposed on prices.

## Sell to 5-80 FTE Dutch maintenance agencies through the channels where owners benchmark themselves

The organised Dutch agency tier is small and measurable. The DDA benchmark covers **144 agencies with about 7,700 FTE and €1.2bn revenue**, averaging **about €160k revenue per FTE**, with high performers at **€234k** ([Dutch IT Channel](https://www.dutchitchannel.nl/research/656222/dutch-digital-agencies-benchmark-2024-winstgevendheid-blijft-overeind-in-uitdagende-markt)). Simplicate benchmarks almost **550 agencies** ([Emerce](https://www.emerce.nl/nieuws/105-euro-per-uur-helft-tijd-nietproductief)). The ~46,000 businesses under SBI 62.01 are overwhelmingly freelancers ([CompanyData](https://companydata.com/nl/sbi-code/sbi-code-62/)). This report estimates the serviceable NL market at **1,000-3,000 agencies with three or more developers**, an estimate that a paid KVK extract should confirm. At an average spend of about €650 per month (Agency fee plus 20 top-up credits), **50 agencies make about €390k ARR**, a 2-5% share of that market. That is achievable, but it also means NL alone cannot carry a large company. The EU step is structural, not optional.

**Target segment.** Dev-heavy web and software agencies of **5-80 FTE**, the band Emerce already uses ([Emerce](https://www.emerce.nl/nieuws/gemiddeld-uurtarief-agencies-580-fte-groeit-73-procent)), with a recurring book of maintenance and change requests sold by strippenkaart or retainer, code on GitHub or GitLab, and an owner who reads benchmarks. The decision-maker is the owner or founder together with the technical lead; SMB SaaS cycles run **1-3 months** ([Aexus](https://aexus.com/how-long-is-the-average-b2b-software-sales-cycle/)).

**First customers.** Ten design partners from DDA members and Simplicate or Teamleader users with **10-50 FTE and an active maintenance backlog**, preferably two or three on shared stacks, so that delivery rates are comparable. The Freelancer edition is a funnel and a test bed, not the revenue engine.

**Channels.**

- **DDA's closed quarterly circles and events** ([DDA](https://dutchdigitalagencies.com/events/)).
- **Emerce's research and open calls for agencies to take part in its rates study** ([Emerce](https://www.emerce.nl/nieuws/doe-mee-ons-onderzoek-digital-agencytarieven)). Co-publishing a "revenue per senior hour" benchmark would speak the language owners already use.
- **Integrations with Simplicate, Teamleader and Gripp**, where tickets, hours and invoices live.
- Founder-led LinkedIn content, and a 10-15% referral programme.

**Expansion.** Flanders first: same language, and Teamleader is Belgian. DACH second, where EU-only data routing is a selling point.

**Positioning.** No hosted coding-agent vendor surveyed targets agencies with a client portal, per-client billing or white label, and none prices per ticket or per PR. Jules counts tasks per day, and only Sourcegraph charges on merge ([Sourcegraph](https://sourcegraph.com/blog/agentic-batch-changes-pricing); [HackUp](https://hackup.ai/ai-plans/jules/)). "Not found" is not "confirmed absent"; a Product Hunt and YC sweep is still owed.

| Alternative | How it bills | Glide's line against it |
|---|---|---|
| Devin, Replit Agent, Copilot cloud agent, Cursor, Codex | ACUs, effort or token credits; account-level caps, some added late ([usecarly](https://www.usecarly.com/blog/devin-pricing/); [The Register](https://www.theregister.com/2025/09/18/replit_agent3_pricing/)) | "A fixed price per ticket, charged only on delivery, capped before a cent is spent" |
| OpenAI Symphony, Multica, OpenHands | Open-source orchestration; self-hosting is enterprise-only at OpenHands ([InfoWorld](https://www.infoworld.com/article/4164173/openais-symphony-spec-pushes-coding-agents-from-prompts-to-orchestration.html)) | "The commercial agency layer they lack: portal, wallets, white label, previews, EU routing" |
| Lovable Partner Program | Referral commission of 10-20%; the product stays Lovable-branded | "Your brand, your price, your margin" |
| Human white-label dev shops | Hourly or per task | "Same resale model at a fraction of the cost, delivered in hours" |
| DIY Claude Code or Cursor inside the agency | About $6 per developer per day, with bills that swing 2-3x ([Digital Applied](https://www.digitalapplied.com/blog/ai-coding-tool-adoption-2026-developer-survey)) | "Predictable cost of goods per ticket and a client-facing product, not a developer tool" |

The commoditisation of tracker-to-PR orchestration means Glide's moat is not "ticket to PR". It is **authorized, capped spend with delivery-only charging, wrapped in an agency business model**. Every piece of messaging should lead with that.

## The legal and tax setup decides whether white-label works

Three structural choices matter more than the rest.

**GDPR roles.** Source code, commits, fixtures and ticket text contain personal data, so Glide is a processor. In white-label deployments it is a **sub-processor** under the agency, which processes for its end client. The DPA (*verwerkersovereenkomst*) must work in both configurations, because EDPB Opinion 22/2024 requires controllers to be able to verify **every sub-processor in the chain** ([EDPB](https://www.edpb.europa.eu/system/files/2024-10/edpb_opinion_202422_relianceonprocessors-sub-processors_en.pdf)). The agency should choose a routing policy, "EU-only" (Mistral, or Bedrock/Vertex EU regions at about +10%) or "EU + US under the DPF", recorded in the order form. Keep SCCs as a fallback, because the DPF appeal is pending at the CJEU (C-703/25 P) ([WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework)). Never send client data to DeepSeek's China-hosted API; German and Italian regulators have already acted against it ([VinciWorks](https://vinciworks.com/blog/germany-moves-to-block-deepseek-will-the-rest-of-the-eu-follow/)). Use open weights on EU infrastructure or nothing. Prohibit training on customer code in both directions.

**VAT on credits.** Credits sold to a Dutch agency for its own use are most likely a single-purpose voucher or an advance payment, with **21% VAT at sale**. Sales to EU agencies are reverse-charged ("btw verlegd") ([Belastingdienst](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/bijzondere_regelingen/vouchers-zegels-waardebonnen/vouchers-zegels-waardebonnen)). The trap is white-label resale. Credits passed down a cross-border chain can become multi-purpose vouchers, and CJEU C-68/23 addresses exactly this kind of distributor chain ([VATabout](https://vatabout.com/cjeu-case-c-6823-digital-vouchers-and-vat-clarifying-the-line-between-single-and-multi-purpose-vouchers)). **Structure the white-label edition so that agencies resell their own development service priced per ticket, never Glide credits as vouchers.** This needs tax-adviser sign-off. Book prepaid balances as deferred revenue, recognise revenue per delivered ticket, and recognise breakage only once cohort data exists (IFRS 15 / RJ 270).

**AI Act, CRA and contracts.**

- **AI Act.** Glide is the *provider* of a non-high-risk AI system. **Art. 50 disclosure has applied since 2 August 2026**, and the grace period for machine-readable marking ends **2 December 2026** ([Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/)). Build an unremovable AI disclosure into the white-label portal, and label AI-authored PRs and commits.
- **CRA.** The **self-hosted edition is very likely a product with digital elements under the CRA**. Its 24h/72h vulnerability and incident reporting has run since **11 September 2026**, and fines reach **€15m or 2.5% of turnover** ([Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/cyber-resilience-act-reporting-obligations-take-effect-on-11-september-2026-102nzmk); [Privacy World](https://www.privacyworld.blog/2026/09/cyber-resilience-act-11-september-2026-key-starting-point-for-reporting-obligations/)). Its price must fund an SBOM, a support period and a disclosure process. That is why it starts at €18-24k per year rather than a few hundred euros.
- **NIS2.** Glide is probably below the Dutch NIS2 (Cbw) size threshold, but in-scope clients will pass security requirements down the chain ([Clyde & Co](https://www.clydeco.com/en/insights/2026/07/dutch-cybersecurity-act-enters-into-force-on-15-au)). Budget for ISO 27001 readiness.
- **Contracts.** Base them on **NLdigital Voorwaarden 2025** and its AI module ([NLdigital](https://www.nldigital.nl/kennis-producten/nldigital-voorwaarden-2025/)), delivered through a click-accept flow with a downloadable PDF. Sign-up is B2B only (KvK or VAT number required). Liability is capped at 12 months of fees, with a super-cap for data breaches.
- **IP and licences.** Assign "whatever rights exist" in outputs, since purely AI-generated code likely has no EU copyright ([Bird & Bird](https://www.twobirds.com/en/insights/2026/belgium/ai-coding-can-you-protect-what-your-agents-create)). Scan PRs for copyleft snippets.

## Six risks, the figures to verify, and a 90-day plan gated on measured delivery

The largest risk is **delivery rate below 55%**. It degrades Glide's margin and, more sharply, the agency's per-hour economics, so it is the first gate rather than an afterthought. The other risks, and their mitigations:

- **Model repricing.** Gemini Flash's promotional rates double on 1 January 2027, and Opus pricing has already moved once in 2026 ([TokenCost](https://tokencost.app/models/gemini-3-flash)). Mitigate with the quarterly floor recomputation and the premium-model multiplier.
- **Infrastructure inflation.** Hetzner's dedicated-vCPU plans rose **113-175%** in June 2026 ([Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases)). Mitigate with metered preview rates and aggressive sleep defaults.
- **DIY substitution** by technically strong agencies. Mitigate by selling the agency layer, not the agent.
- **Credits are "not intuitive to buyers"** ([Metronome](https://metronome.com/blog/ai-pricing-in-practice-2025-field-report-from-leading-saas-teams)). Always show euros next to credits, and publish the fixed euro value of a credit.
- **White-label support load, and the VAT and CRA exposure** of the resale and self-hosted editions. Keep both in beta until legal sign-off.

### Figures to verify before external use

All external figures came from search-result summaries. Before any of them appears in a pitch or price sheet, confirm:

- Opus 5.5 and Sonnet 5 prices (single aggregator), and the EU-residency premium.
- The METR 24-point merge gap and the SWE-bench Pro scores.
- The €105 hourly rate, 55% productivity and DDA figures (Emerce, DDA and Simplicate pages were not readable).
- Copilot's $6-12 per session and Devin's conflicting ACU prices.
- Hetzner's post-June prices, and the 0.7% Stripe Billing fee.
- The holding of C-68/23, the CRA December 2027 full-application date, and whether the AI Omnibus changed Art. 4.
- Every agency-economics input in the S-ticket table: developer cost, review time and hours per S. These are this report's assumptions and are the first things the pilot must measure.

### 90-day plan

| Window | Work | Validation gate (all must pass to proceed) |
|---|---|---|
| Days 1-30 (to 29 Oct 2026) | Recruit 5 design-partner agencies; run 200+ real tickets at no charge or at cost; instrument Ploeg for cost per Shift, cap-hit rate, delivery by size, review minutes; hold 20 owner willingness-to-pay interviews on the €95-150 S band; draft the DPA (both configurations), terms and sub-processor list; brief a tax adviser on voucher structure | **S delivery ≥ 60% and M ≥ 50%** on refined tickets; median token cost per delivered S **≤ €4**; cap-hit rate **< 15%**; median review time per S **≤ 30 minutes**; at least 12 of 20 owners accept €15 per S as cost of goods |
| Days 31-60 (to 28 Nov 2026) | Convert to paid pilots at list price, with a 12-month price lock as the only founding concession; client portal live with real end clients of at least 3 agencies; enforce default-on caps; finalise the "delivered" definition and reversal flow; ship Art. 50 disclosure before the 2 Dec marking deadline | **≥ 5 paying agencies**; **≥ 60% of delivered tickets resold** to end clients at a fixed price; measured agency margin per senior hour **≥ 1.5x their hourly baseline**; **zero invoices above a configured cap**; disputed or reversed tickets **< 5%** |
| Days 61-90 (to 27 Dec 2026) | Publish the NL price book; open white-label beta (2 agencies, own-service resale structure); appear at a DDA circle and join Emerce's rates research; ship Simplicate or Teamleader export; recompute the floor from measured p90 costs before the Gemini repricing on 1 Jan 2027 | **15-20 paying agencies**; **MRR €8-15k**; Glide gross margin on credits **≥ 60%** measured; **≤ 1** logo churned; **2 white-label agreements signed** with tax sign-off; **1 self-hosted LOI**. Passing these gates triggers Flanders outreach in Q1 2027 |

## Conclusion

The research turns the pricing question into a delivery question. The €15 credit, the €4 S cap and the €150 resale price are all close to right. They are right *only above a delivery threshold*. Below about 61%, the agency's fixed-price promise loses to hourly billing. Below 55%, Glide's own margin thins toward its floor. That makes the refinement Run's "agent-ready" judgment, which decides which tickets are even offered at a fixed price, the most commercially important component in the system. It matters more than any discount ladder. It also reframes "fair to the client": fairness comes from a quote the client approves, a charge only on accepted delivery, and failures that are never quietly billed. It does not come from the lowest price.

Strategically, Glide's defensible asset is not the agent but authorized, capped spend sold as a resellable unit. Competitors are converging on token credits and reactive caps, and open-source orchestrators are commoditising the pipeline. That leaves the combination of delivery-only pricing, before-spend caps, a client portal and white label unoccupied, as far as this research could see. The window is open, but it is tied to measured performance. The first 30 days should produce a delivery-rate number, not a sales pipeline.
