# Usage-based, credit-based and hybrid pricing practice for developer and infrastructure platforms (as of September 2026)

Method note for the report writer: the research tool's network proxy blocked direct page fetches (vercel.com, docs.netlify.com, metronome.com, growthunhinged.com and techcrunch.com all returned EGRESS_BLOCKED). All findings below come from search-result extracts. Where the URL is a primary source (vendor docs, vendor press release, vendor changelog), the figure is from that source's indexed text. Where it is a third-party aggregator (Flexprice, Schematic, getmacha, vendorbenchmark and similar), treat the figure as secondary and re-verify it before publishing. Unless stated otherwise, prices are "as indexed, 2026" (research date 2026-09-29).

## 1. How peer platforms price: credits vs direct meters, allowances, overage, caps and alerts

### Takeaway
The dominant 2026 pattern for developer platforms is a hybrid: a platform or seat fee that includes the same dollar amount of usage credit (Vercel Pro $20 with $20 of credit, Railway Pro $20 with $20, Railway Hobby $5 with $5), with metered overage on top. Default protection varies from none, through an opt-in cap, to an on-by-default hard cap:
- none by default: Railway, and historically Vercel and Netlify
- an opt-in pause: Vercel today
- an on-by-default hard cap: Supabase Pro, GitHub Actions ($0 limit), and OpenAI/Anthropic prepaid balances

The platforms with on-by-default caps generate far fewer bill-shock stories.

### Cited Findings
**Vercel**
- Pro is $20 per deploying seat per month and bundles $20 of usage credit with each seat. — [Flexprice, Vercel pricing breakdown](https://flexprice.io/blog/vercel-pricing-breakdown); [Vercel pricing](https://vercel.com/pricing)
- Spend Management: every new team gets a default on-demand budget of $200, which can be changed. Notifications go out by email, web and SMS. At 100% of the budget Vercel can optionally pause all projects (a hard limit) and fire a webhook. Alerts start at 75% of the monthly credit, with daily and weekly summaries once usage is on-demand. — [Vercel docs, Spend Management](https://vercel.com/docs/spend-management); [Flexprice](https://flexprice.io/blog/vercel-pricing-breakdown)
- Pausing is not the default. It must be configured. — [Schematic, Vercel pricing](https://schematichq.com/blog/vercel-pricing)

**Netlify**
- Netlify moved every new account to credit-based plans on 2025-09-04. A single credit balance replaced 15+ separate metrics, add-on packages and usage tiers. Accounts created before that date can stay on Legacy plans. — [Netlify changelog, credit-based plans](https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/); [Netlify docs, credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- Example credit burn (secondary source):
  - A production deploy costs 15 credits (about $0.10), so 100 deploys a month use 1,500 credits, about half of Pro's included allocation.
  - Bandwidth costs 20 credits per GB, so 300 GB a month uses 6,000 credits, twice the Pro allocation.
  - Free is 300 credits; Pro is $20.
  — [Flexprice, Netlify guide](https://flexprice.io/blog/complete-guide-to-netlify-pricing-and-plans); [Toolchase](https://toolchase.com/blog/netlify-pricing-guide/)
- Netlify has a spending cap and staged alerts for new accounts. The critique is that "bill shock happens when protections are opt-in". — [Flexprice](https://flexprice.io/blog/complete-guide-to-netlify-pricing-and-plans)

**Supabase**
- Pro is $25 a month and ships with a spend cap switched on by default, which holds the bill at $25. To pay for overage you turn the cap off. — [Supabase pricing](https://supabase.com/pricing); [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
- Pro includes $10 a month of compute credit per project (one Micro instance).
- Overage past the included quotas:
  - MAU above 100,000: $0.00325 each
  - Egress above 250 GB: $0.09/GB
  - Disk above 8 GB: $0.125/GB
  - Compute sizes: Small from $15, Medium $60
  — [Flexprice, Supabase breakdown](https://flexprice.io/blog/supabase-pricing-breakdown)
- Team is $599 a month. — [metacto](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)

**Railway**
- Hobby is $5 a month with $5 of usage credit. Pro is $20 per seat with $20 of credit.
- vCPU, RAM and egress are metered per second. There is no hard spending cap by default.
- Railway offers a one-time $5 trial credit.
— [DEV, Render vs Railway vs Fly.io 2026](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p); [hostim.dev](https://hostim.dev/blog/render-vs-railway-vs-fly-pricing/)

**Render**
- Fixed instance prices, paid whether the app is busy or idle: Starter $7/month, Standard $25, Pro tiers $85 to $450 (Pro Ultra).
- Render is the only one of the three with an ongoing free option in 2026.
— [DEV](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p)

**Fly.io**
- Per-second machine billing. The smallest shared-cpu-1x/256 MB machine is about $2.02 a month. Extra RAM is about $5/GB-month. NA/EU egress is $0.02/GB.
- The old $5 monthly free allowance is gone for new accounts, which get a trial (2 VM hours or 7 days) and then need a card on file.
— [DEV](https://dev.to/pavel-hostim/render-vs-railway-vs-flyio-pricing-compared-2026-2e5p); [saaspricepulse](https://www.saaspricepulse.com/blog/flyio-free-tier-2026)

**Heroku**
- Eco is $5 for 1,000 dyno-hours a month, shared across the account, and Eco dynos sleep after 30 minutes idle.
- Basic dynos are $7 a month (about $0.01/hour) and always on.
— [Heroku blog, new low-cost plans](https://www.heroku.com/blog/new-low-cost-plans/); [Heroku help](https://help.heroku.com/2XZEBC20/how-much-does-a-hobby-or-basic-dyno-cost)

**GitHub Actions**
- Included minutes each month: 2,000 on Free, 3,000 on Team (private repos, GitHub-hosted runners).
- A Free account's default spending limit is $0: jobs stop instead of billing. Budgets can block workflows when reached.
— [GitHub Docs, Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions); [GitHub Docs, budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets); [cicdcalculator](https://cicdcalculator.com/github-actions-free-tier)
- On 2026-01-01 GitHub cut hosted-runner prices by up to 39%. Linux is quoted at about $0.006/min after the cuts. — [GitHub, 2026 Actions pricing changes](https://github.com/resources/insights/2026-pricing-changes-for-github-actions); [cicdcost](https://cicdcost.com/github-actions-pricing)
- On 2025-12-16 GitHub announced a $0.002/min "cloud platform charge" on self-hosted runners in private repos from 2026-03-01. — [GitHub changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/); [DevClass](https://www.devclass.com/development/2025/12/17/github-to-charge-for-self-hosted-runners-from-march-2026/1734518)
- An aggregator says GitHub postponed that charge within 48 hours after backlash, and that self-hosted runners were still free as of August 2026. This conflicts with other snippets that describe the charge as "introduced" on March 1, 2026. — [samexpert](https://samexpert.com/github-actions-pricing-backlash-2026/); [Northflank](https://northflank.com/blog/github-pricing-change-self-hosted-alternatives-github-actions); community reaction in [GitHub Discussion #182089](https://github.com/orgs/community/discussions/182089)

**GitLab CI**
- Extra compute minutes are $10 per 1,000 ($0.01/min).
- Runners have cost factors: 1x for Linux/Windows medium, higher for large runners, 6x for macOS M1 medium.
- 400 free minutes a month.
— [GitLab pricing](https://about.gitlab.com/pricing/); [cicdcost](https://cicdcost.com/gitlab-ci-pricing)

**Twilio**
- Pay-as-you-go with automatic per-volume tiers. US SMS is about $0.0083 per message.
- Committed-use contracts lower unit prices further. See section 2.
— [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us); [Twilio help, volume pricing](https://help.twilio.com/articles/223134007)

**OpenAI API**
- Prepaid credit balance, with optional auto-recharge.
- Purchased credits expire after 1 year and are non-refundable.
- Usage tiers from Free to Tier 5 are based on cumulative spend and account age: Tier 1 at $5, Tier 5 at $1,000 plus 30 days. Tiers raise rate limits and spend capacity.
— [OpenAI Help, prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing); [OpenAI service credit terms](https://openai.com/policies/service-credit-terms/); [OpenAI Help, spend limits](https://help.openai.com/en/articles/6614457-troubleshooting-api-usage-and-spend-limits)

**Anthropic API**
- The Console uses prepaid credits.
- Secondary sources say credits expire one year after purchase and are non-refundable.
- The usage tier caps monthly spend regardless of balance. Moving up tiers raises the cap and the rate limits.
- Sources conflict: one aggregator describes Anthropic API billing as post-paid.
— [Claude docs, rate limits](https://platform.claude.com/docs/en/api/rate-limits); [BenchLM](https://benchlm.ai/blog/posts/api-credits-explained); conflicting description in [Dodo Payments](https://dodopayments.com/blogs/anthropic-billing-model)

**Cursor** (see section 3 for the history)
- Since June 2025, plans include a usage pool priced at API cost. Pro is $20 with $20 of included usage. Overage requires a user-set spend limit.
— [Vantage, Cursor pricing](https://www.vantage.sh/blog/cursor-pricing-explained)

**Snowflake and Databricks**
- Direct unit meters (Snowflake credits, Databricks DBUs), with enterprise capacity commitments. See section 2. — [vendorbenchmark, Snowflake](https://vendorbenchmark.com/vendors/snowflake-pricing)

### Inferences
- The "platform fee = included credit" pattern (Vercel, Railway, Cursor $20/$20) is now a convention, and buyers will understand it. For Glide, a tier fee that includes a credit allowance matches what agencies already see on Vercel and Railway invoices.
- The strongest trust signal is a default-on cap:
  - Supabase: the cap is on by default and holds the bill at the plan price.
  - GitHub: the spending limit defaults to $0.
  - OpenAI and Anthropic: prepaid balances plus tier ceilings.

  Vercel's defaults are softer: a $200 budget with the pause opt-in. The goals Glide has stated ("hard budget caps to avoid bill shock") line up with the Supabase and GitHub defaults.
- Cost-factor multipliers on one base unit (GitLab's macOS 6x, Netlify's credits per GB or per deploy) let a single currency cover different meters. The same approach fits Glide's CI CPU minutes, preview-environment hours and GB-months.
- Netlify's deploy-credit example shows a risk. Charging for high-frequency, low-value events (each deploy) can drain an allowance before the customer sees any value. For Glide, the analogue would be charging per CI run or per preview spin-up inside a ticket.

### Gaps
- Could not fetch Vercel's current per-meter overage rates, Netlify's credit-pack prices, or its rollover/auto-recharge rules from primary pages (egress blocked).
- Cursor's exact 2026 tier list (Pro+, Ultra, Teams per-seat) was not confirmed from Cursor's own pricing page.
- Anthropic API: conflicting descriptions (prepaid vs post-paid). Needs primary confirmation.

## 2. Volume discounts and committed-use discounts (percentages, thresholds, prepaid credits, rollover and expiry)

### Takeaway
Self-serve developer platforms rarely publish volume discounts. Discounts come through sales-negotiated commitments:
- Twilio: 10 to 25% for about $1k to $10k+ a month of committed spend.
- Snowflake and Databricks: annual capacity commitments with use-it-or-lose-it terms.
- OpenAI and Anthropic: prepaid credits that expire 12 months after purchase.

Rollover is the exception, and it is won by negotiation.

### Cited Findings
- Twilio: accounts spending $1,000+ a month can get 10 to 25% off SMS, voice and Verify through sales. Commitments of $5,000 to $10,000 a month are quoted at 10 to 23% off. These figures come from secondary sources. Twilio's own help page confirms volume tiers and committed-use pricing but was not fetched for percentages. — [Automation Atlas](https://automationatlas.io/answers/twilio-pricing-explained-2026/); [CostBench](https://costbench.com/software/sms-marketing/twilio/); [Twilio help](https://help.twilio.com/articles/223134007)
- Snowflake: pre-purchased capacity credits usually expire at the end of the contract year, and unused credits do not roll forward by default. Negotiators push for partial rollover (20% to 50%). Contracts of $500k+ a year typically get rollover only if it is explicitly negotiated. — [vendorbenchmark, Snowflake](https://vendorbenchmark.com/vendors/snowflake-pricing); [bestnegotiationconsultingfirms](https://bestnegotiationconsultingfirms.com/blog/snowflake-vs-databricks-cost-comparison)
- Databricks: the customer pays the full committed capacity whatever it actually uses. Unused DBUs do not roll over, under-use leads to a true-up, and over-use is billed in arrears at standard rates. — [Redress Compliance](https://redresscompliance.com/databricks-negotiation)
- The Azure Databricks pre-purchase plan is the primary-source example of a prepaid commitment discount on Databricks units. — [Microsoft Learn](https://learn.microsoft.com/en-us/azure/cost-management-billing/reservations/reservation-discount-databricks)
- OpenAI and Anthropic: prepaid API credits expire after 1 year and are non-refundable. — [OpenAI service credit terms](https://openai.com/policies/service-credit-terms/); [BenchLM](https://benchlm.ai/blog/posts/api-credits-explained)
- Salesforce Agentforce Flex Credits (launched 2025-05-15):
  - $500 per 100,000 credits.
  - A standard action uses 20 credits, which is $0.10 per action.
  — [Salesforce press release](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/)
- GitHub cut hosted-runner prices by up to 39% on 2026-01-01. This was a list-price cut, not a volume discount. — [GitHub](https://github.com/resources/insights/2026-pricing-changes-for-github-actions)

### Inferences
- The going rate for committed-spend discounts is roughly 10 to 25% at the scale of thousands of dollars a month (Twilio). Enterprise data platforms give larger discounts in return for use-it-or-lose-it commitments.
- For Glide:
  - A 12-month expiry on prepaid bundles is the market default (OpenAI, Anthropic, Snowflake).
  - Monthly included credits normally reset each cycle (GitHub minutes, the Vercel and Railway credits). They do not roll over.
  - Partial rollover (20 to 50%) is a known concession to offer larger commitments.
- The Databricks asymmetry (pay the full commitment when under, pay list price when over) is what makes customers resent commitments. Priced-down overage for committed customers is a softer alternative, but it is not directly evidenced in these sources.

### Gaps
- No primary source found with published graduated or volume tiers for developer-platform meters (for example Vercel bandwidth tiers) in 2026.
- No sourced benchmark for typical prepaid bundle bonus percentages (for example "buy $1,000, get $1,100").

## 3. Bill shock, churn and trust problems, and how companies fixed them

### Takeaway
The best-documented cases (the Netlify $104k DDoS bill in 2024, the Cursor pricing change in June and July 2025, and GitHub's self-hosted runner fee in December 2025) share three features:
- the change or the spike was unannounced or unclear
- no cap was on by default
- the remedy was retroactive forgiveness or refunds followed by product guardrails

### Cited Findings
**Netlify, February 2024**
- A static site on the free plan was DDoSed and billed about $104,500 for bandwidth. — [Hacker News thread](https://news.ycombinator.com/item?id=39520776); [Cybernews](https://cybernews.com/news/ddos-attack-104k-bill-from-hosting-provider/)
- Netlify's CEO (HN user bobfunk, Matt Biilmann) said the bill would be forgiven. The stated policy was to forgive bills from legitimate mistakes after the fact rather than shut down sites. Commenters asked why there was no spending limit. — [Hacker News](https://news.ycombinator.com/item?id=39520776); [Cybernews](https://cybernews.com/news/ddos-attack-104k-bill-from-hosting-provider/)
- A collection of Vercel and Netlify bill-shock incidents (for example a Vercel bandwidth bill of about $1,100) exists. These are secondary sources with a commercial interest. — [getmonii incidents](https://getmonii.com/incidents); [deploybase](https://deploybase.app/blog/vercel-bill-shock-1100-bandwidth-costs-alternatives-2026)

**Cursor, June to August 2025**
- In June 2025 Cursor replaced 500 "fast requests" a month with a usage-credit pool priced at API cost.
- Users ran out after a few prompts with Claude models. Others were charged overage because they had not set a spend limit.
- On 2025-07-04 the CEO, Michael Truell, apologised: "Our recent pricing changes were not communicated clearly. That's our mistake." Cursor refunded unexpected charges incurred between 2025-06-16 and 2025-07-04.
- In August 2025 Cursor moved Teams to the same API-cost-based billing.
— [TechCrunch](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/); [FinTech Weekly](https://www.fintechweekly.com/magazine/articles/cursor-pricing-change-user-backlash-refund); [Vantage](https://www.vantage.sh/blog/cursor-pricing-explained)

**GitHub, December 2025**
- The announced $0.002/min fee on self-hosted runners drew heavy community pushback. — [GitHub Discussion #182089](https://github.com/orgs/community/discussions/182089)
- An aggregator reports the fee was postponed within 48 hours. — [samexpert](https://samexpert.com/github-actions-pricing-backlash-2026/)

**Salesforce Agentforce**
- The original $2-per-conversation price drew complaints about unpredictable cost and weak value alignment.
- In May 2025 Salesforce added Flex Credits at $0.10 per action. A secondary source says most use cases now cost $0.10 to $0.30 per interaction.
— [Salesforce press release](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/); [concret.io](https://www.concret.io/blog/new-agentforce-pricing-model)

**Intercom**
- The CEO reportedly gave up about $50M of ARR to simplify pricing. This is a podcast-derived secondary summary. — [Lenny's Vault](https://lennysvault.com/insights/case-studies-lessons/c5d58fe4-1ee0-42d9-bd5b-521103417dfe)

**The fixes that were adopted**
- Vercel: a default $200 on-demand budget, alerts at 75% and 100%, optional auto-pause, and webhooks. — [Vercel docs](https://vercel.com/docs/spend-management)
- Supabase: the spend cap is on by default. — [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
- Netlify: a spending cap and staged alerts on credit plans. — [Flexprice](https://flexprice.io/blog/complete-guide-to-netlify-pricing-and-plans)

### Inferences
- The recurring failure is a change in the meaning of the unit without advance notice, which turns an old mental model ("500 requests") into surprise charges. Clear communication, grandfathering (Netlify let Legacy customers stay), and refunds after the fact are the standard repairs.
- Charging only when a ticket is delivered protects against the Cursor-style complaint that credits burned without a result. Metered usage outside tickets (tokens, CI, previews) is where Glide's bill-shock exposure sits. Those meters need caps that are on by default and alerts at 75% and 100%.
- Agencies resell or pass through costs to their own clients. An agency that absorbs one surprise bill has direct margin damage. That argues for per-client or per-project budgets, not only account-level ones (an inference; not sourced to an agency-specific study).

### Gaps
- No quantitative churn data found on the effect of bill shock (for example the share of customers who churn after an overage).
- Cursor's post-change user numbers and revenue effect were not verified.

## 4. Outcome-based and per-resolution pricing in AI

### Takeaway
Per-resolution pricing is now established in customer support:
- Intercom Fin: $0.99 per resolution
- Zendesk: $1.50 committed or $2.00 pay-as-you-go per automated resolution
- Sierra: outcome-based, no public rate card
- Salesforce: moved from $2 per conversation to $0.10 per action

Intercom is the growth proof point, with Fin reportedly above $100M ARR and growing about 350% year over year. Defining the outcome ("resolved") and handling disputes are the operational challenges. These map directly to Glide's "charge only on delivery" design.

### Cited Findings
**Intercom Fin**
- $0.99 per resolution. A resolution is a conversation where Fin answers and the customer either confirms it helped or leaves without asking for more help.
- Billing is per conversation, and a charge can be reversed if the customer returns for more help.
— [Intercom Help, Fin outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes)
- When Fin runs on another help desk there is a 50-outcome monthly minimum ($49). Intercom seats are $29, $85 or $132 a month on annual billing. — [getmacha](https://www.getmacha.com/blog/intercom-fin-pricing); [Featurebase](https://www.featurebase.app/blog/intercom-pricing)
- Fin reportedly passed $100M ARR, growing about 350% year over year, with about 8,000 customers. It was about to be half of Intercom's revenue (about $400M ARR). Intercom layered per-resolution pricing on top of existing seat revenue. — [Mostly Metrics](https://www.mostlymetrics.com/p/how-intercom-reaccelerated-growth-with-outcome-based-pricing); [Sacra](https://sacra.com/c/intercom/); [Eoghan McCabe on X](https://x.com/eoghan/status/1932879226535096536)
- Intercom reports a resolution rate of about 65%. — [Cognitive Revolution podcast](https://www.cognitiverevolution.ai/the-customer-service-revolution-building-fin-with-eoghan-mccabe-fergal-reid-of-intercom/)
- An aggregator claims Salesforce completed an acquisition of Fin on 2026-09-10. This is **unverified**: it appears in one aggregator only and no press confirmation was found, so do not use it without checking. — [getmacha](https://www.getmacha.com/blog/intercom-fin-pricing)

**Zendesk**
- Outcome-based pricing for AI agents: $1.50 per automated resolution on committed volume, $2.00 pay-as-you-go. Escalations to a human are not charged. Zendesk says it was first in CX to offer this. — [Zendesk newsroom](https://www.zendesk.com/newsroom/articles/zendesk-outcome-based-pricing/); [premiumplus](https://premiumplus.io/blog/understanding-zendesks-new-automated-resolution-pricing-model-what-you-need-to-know)
- Zendesk's CEO, Tom Eggemeier, and Sierra's co-founder, Clay Bavor, argue that seat pricing is giving way to paying per result. — [daily.dev summary](https://daily.dev/posts/zendesk-and-sierra-say-ai-agents-should-be-paid-per-result-not-per-seat-nkje2b2zg)

**Sierra**
- Outcome-based pricing, but no public rate card. — [getmacha, Sierra](https://www.getmacha.com/blog/sierra-ai-pricing-explained)

**Salesforce Agentforce**
- Launched at $2 per conversation, then added Flex Credits ($500 per 100k credits, $0.10 per action) in May 2025. — [Salesforce](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/)

**Margins**
- No source gave outcome-specific margins. General AI-app margins are in section 5.

### Inferences
- Each successful per-outcome model has four parts:
  - a precise, auditable outcome definition
  - an exclusion rule for failures (escalations are free)
  - a reversal window (Fin reverses the charge if the customer returns)
  - a platform or seat fee or minimum underneath (Fin's $49 for 50 outcomes, Intercom seats)
- Glide can copy these directly:
  - "Delivered" defined as a PR opened and passing checks, or accepted by the reviewer.
  - No charge for Shifts that fail.
  - A reversal window if the PR is rejected or reverted.
  - A tier fee as the floor.
- Committed-vs-PAYG spreads for outcomes are about 25% (Zendesk $1.50 vs $2.00). That is a useful benchmark for Glide's commitment discount on ticket credits.
- The vendor carries the cost of failed attempts. Glide's S/M/L sizing needs a pad for failed Runs, so COGS per delivered ticket is higher than the cost of a successful Run.

### Gaps
- Publicly verifiable margins for outcome-based AI products were not found.
- No public adoption rate for Zendesk or Sierra outcome pricing.
- No developer-tool (code or PR) example of per-outcome pricing was found in this search.

## 5. Frameworks and benchmarks: hybrid adoption, AI gross margins, credit systems

### Takeaway
Hybrid pricing (a subscription plus usage or credits) is now the majority or near-majority model. Figures range from 43% to 61% depending on the survey, and 85% of companies in Metronome's survey have some usage-based component. Credit-based pricing more than doubled in 2025. AI app gross margins sit around 45 to 60%, against about 80% for classic SaaS.

### Cited Findings
**Credits and hybrid adoption**
- Kyle Poyar (Growth Unhinged):
  - Credit-based pricing grew 126% in 2025.
  - 29% of companies sell AI credits or tokens, up more than 100% year over year, and another 33% plan to introduce them within 6 to 12 months.
  - Clay's March 2026 pricing change and Figma are cited as examples of the credit trend.
  — [Growth Unhinged, 2026 State of B2B Monetization](https://www.growthunhinged.com/p/the-state-of-b2b-monetization-in-2026); [Growth Unhinged, Clay and AI credits](https://www.growthunhinged.com/p/a-new-vision-for-ai-pricing)
- Poyar's view that "hybrid pricing already won the AI era" (interview). — [Revenue Creator](https://www.revenuecreator.com/p/why-hybrid-pricing-already-won-the-ai-era-kyle-poyar-growth-unhinged)
- Metronome's State of Usage-Based Pricing 2025:
  - 85% of respondents have usage-based pricing.
  - 77% of the largest software companies have some usage-based pricing.
  - Practitioners say credits gave them "breathing room while we figured out the real value metric" but "they're not intuitive to buyers".
  — [Metronome report](https://metronome.com/state-of-usage-based-pricing-2025); [Metronome, AI pricing field report 2025](https://metronome.com/blog/ai-pricing-in-practice-2025-field-report-from-leading-saas-teams)
- Chargebee's 2025 State of Subscriptions: 43% of companies use hybrid models, projected to reach 61% by the end of 2026. — cited via [Chargebee blog](https://www.chargebee.com/blog/usage-based-pricing-for-growth-in-a-changing-landscape/) and aggregators
- OpenView: 61% have a usage-based component, up from 34% in 2021. OpenView wound down its research, so the "2025" dating in aggregators is doubtful. — cited via [getmonetizely](https://www.getmonetizely.com/articles/saas-pricing-benchmarks-2025-how-do-your-monetization-metrics-stack-up)
- Hybrid adopters are said to report 38% higher revenue growth and NRR. These are aggregator claims of uncertain origin. — [getmonetizely](https://www.getmonetizely.com/articles/saas-pricing-benchmark-study-2025-key-insights-from-100-companies-analyzed)

**AI gross margins**
- ICONIQ (300+ AI companies): AI product gross margins were 41% in 2024 and 45% in 2025, with 52 to 53% expected in 2026. Model inference is rising from 20% to 23% of total spend. — [SaaStr summary of ICONIQ State of AI](https://www.saastr.com/the-execution-era-of-ai-5-key-takeaways-from-iconiqs-state-of-ai-report); [CloudZero](https://www.cloudzero.com/blog/ai-gross-margin/)
- a16z: AI app gross margins often cluster at 50 to 60%, with outliers near 90%. This is secondary attribution. — [SoftwareSeni](https://www.softwareseni.com/why-ai-gross-margins-are-so-much-lower-than-saas-and-what-that-means-for-your-business/); [Upstarts Media](https://www.upstartsmedia.com/p/data-ai-startup-margins-rise)

**Unit design**
- Salesforce Flex Credits (1 credit = $0.005, 20 credits per action) show an abstract unit mapped to a fixed dollar value and a fixed cost per action. — [Salesforce](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/)
- Netlify shows a single credit covering many meters. — [Netlify changelog](https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/)

### Inferences
- With AI COGS at 40 to 55% of revenue, Glide cannot price as if margins will be 80%. Credit prices per S/M/L ticket need to cover:
  - inference on the successful Run
  - failed or retried Runs
  - CI minutes consumed inside the ticket
- The Metronome practitioner quote ("not intuitive to buyers") is the main risk of a credit currency. Mitigations:
  - a fixed and published credit-to-currency ratio (Salesforce: $0.005)
  - showing euro equivalents next to credits
  - publishing credit costs per S/M/L ticket up front
- Madhavan Ramanujam's "Monetizing Innovation" (willingness-to-pay conversations before building the product) and Simon-Kucher's work were not reachable in this session. See Gaps.

### Gaps
- Could not access the full text of Growth Unhinged, Metronome, m3ter or Orb reports (blocked). The figures come from indexed snippets.
- No Simon-Kucher or Madhavan Ramanujam 2025–26 AI-pricing figures were retrieved.
- No a16z primary article URL was retrieved for the 50 to 60% margin claim.
- No sourced benchmark for credit breakage (unused expired credits as revenue).

## 6. Billing infrastructure for credits and metering

### Takeaway
The market consolidated in 2026:
- Stripe acquired Metronome (closed 2026-01-14, reportedly about $1B).
- Adyen acquired Orb (closed 2026-07-01, reportedly $335M).

Stripe Billing (0.7% of billing volume) is the default for Stripe merchants. Lago (AGPLv3, EU-based) and OpenMeter are the independent open-source options suited to EU hosting and self-hosting. m3ter and Orb are quote-only.

### Cited Findings
- Stripe completed its acquisition of Metronome on 2026-01-14, reportedly for about $1B, to add real-time metering and enterprise contracts to Stripe Billing. Metronome now brands itself as "a Stripe product". — [MGI Research](https://mgiresearch.com/research/analysis-stripe-acquires-metronome/); [Stripe usage-based billing](https://stripe.com/billing/usage-based-billing); [UsageBox](https://usagebox.com/articles/stripe-acquires-metronome-what-it-means-alternatives-2026)
- Adyen closed its $335M acquisition of Orb on 2026-07-01 and runs it on an "incubator model". The sources are competitor or aggregator content. — [UsageBox](https://usagebox.com/articles/orb-alternatives-2026); [Lago](https://getlago.com/blog/metronome-alternatives)
- Stripe Billing costs 0.7% of billing volume and includes the Meters API up to 100M events a month. This is secondary. Check Stripe's pricing page. — [Flexprice](https://flexprice.io/questions/lago-vs-stripe-billing-comparison); [Kanopy Labs](https://kanopylabs.com/blog/stripe-billing-v2-vs-lago-vs-orb)
- Lago:
  - The AGPLv3 core is free to self-host.
  - Premium (customer portal, RBAC, credit notes) is priced on request.
  - Lago Cloud reportedly starts at about $500 a month.
  — [Kanopy Labs](https://kanopylabs.com/blog/stripe-billing-v2-vs-lago-vs-orb); [Flexprice](https://flexprice.io/questions/lago-vs-stripe-billing-comparison)
- Orb has no published price: three tiers, all quote-only, and no free tier. — [UsageBox](https://usagebox.com/articles/orb-alternatives-2026)
- The open-source options are Lago, OpenMeter and Flexprice. — [Lago](https://getlago.com/blog/metronome-alternatives); [nevermined](https://nevermined.ai/blog/openmeter-alternatives)
- Metronome supports credit-based pricing, enterprise contracts, and multidimensional or hybrid models. — [Orb, Metronome pricing](https://www.withorb.com/blog/metronome-pricing)

### Inferences
- For an EU-based Glide selling to agencies, the choice is between two paths:
  - **Stripe Billing, with Metronome capabilities behind it.** Lowest integration cost if payments already run on Stripe. The cost is 0.7% of billing volume.
  - **Lago or OpenMeter, self-hosted.** Keeps data residency and avoids depending on a vendor inside a payments company.

  Both need their own credit-ledger, expiry and cap features checked against Glide's needs. Glide's needs are prepaid bundles with 12-month expiry, a monthly included allowance, a hard cap, and delivery-triggered charges.
- Hard caps and delivery-gated charges are enforcement decisions. They must live in Ploeg (Run authorization and budget), not only in the billing system, because billing systems rate usage after the fact. This matches Glide's architecture, in which Ploeg authorizes and budgets every Run.

### Gaps
- m3ter pricing and OpenMeter Cloud pricing were not found.
- Stripe's native "billing credits" feature (credit grants) was not confirmed from a primary page in this session.
- The Orb and Metronome deal values come from secondary sources. Press releases from Adyen and Stripe were not retrieved.
