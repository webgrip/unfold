# Credit design for software pricing (as of September 2026)

Method note: every WebFetch in this session was refused by the network egress proxy (kylepoyar.substack.com, growthunhinged.com, github.blog, cursor.com, docs.replit.com, infoworld.com). **All findings below come from search-result summaries, not from reading the full pages.** Treat each figure as "seen in search summary" and check it on the primary page before quoting it publicly. Where the summary came from an aggregator or blog rather than the vendor, this is noted.

## 1. How companies define credits in 2025-2026 and what a credit represents

### Takeaway
There are three families. (a) **Currency-pegged credits**: the credit is a fixed amount of money that burns down at token or compute rates (Copilot AI Credits at $0.01, Codex at about $0.04, Kiro overage at $0.04, Salesforce Flex Credits at $0.005, Cursor's "$20 of usage"). (b) **Abstract resource units** whose money price varies by edition, contract or region (Snowflake credits, Databricks DBUs, Devin ACUs about 15 agent-minutes). (c) **Outcome units**: one charge per result, usually shown directly in currency (Intercom Fin at $0.99 per resolution, Salesforce's $2 per conversation). The market moved from request-count and effort units toward currency-pegged credits during 2025-2026. Glide's delivery credit is an outcome unit, which is rare and easier to justify than a resource credit.

### Cited Findings
- GitHub Copilot: on 1 June 2026, request-based billing ("premium requests", now labelled legacy) was replaced by usage-based billing in GitHub AI Credits, where **1 credit = $0.01 USD**, metered on actual token use. Plans include credits worth more than the plan price: Pro $10 includes $15, Pro+ $39 includes $70, and a new Max plan at $100 includes $200. Customers on annual plans stay on request billing until renewal. — [GitHub Blog](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/) (summary); [dev.to explainer](https://dev.to/rebeca_vb/github-copilot-premium-requests-allowances-multipliers-billing-and-what-replaced-them-d3p) (summary); [GitHub Docs, legacy requests](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests)
- Cursor: on 16 June 2025 the Pro plan dropped "500 fast requests" for "$20 of usage per month, billed at API rates". Cursor's stated reason was that "new models can spend more tokens per request on longer-horizon tasks". — [TechCrunch, 7 Jul 2025](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/) (summary); [Cursor blog "Clarifying our pricing"](https://cursor.com/blog/june-2025-pricing) (summary)
- OpenAI Codex: since 2 April 2026, all plans meter usage in token-based credits worth about **$0.04 each**. Published rate example: GPT-5.5 at 125 credits per 1M input tokens and 750 per 1M output tokens. Illustrative costs: a small bug fix is about 10 credits (about $0.40) and a multi-file refactor about 60 credits (about $2.40). — [OpenAI Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card) (summary); per-task examples from aggregators [Taskade](https://www.taskade.com/blog/codex-pricing-explained) and [morphllm](https://www.morphllm.com/codex-pricing) (summary, not vendor-verified)
- Replit, "effort-based pricing": this replaced a flat **$0.25 per checkpoint**. A simple change now usually costs less than $0.25, and a large task becomes one checkpoint that can cost much more. — [Replit blog, introducing effort-based pricing](https://blog.replit.com/effort-based-pricing) (summary); [Replit recap](https://replit.com/blog/effort-based-pricing-recap) (summary)
- Kiro (AWS): the August 2025 plan charged $0.20 per "spec request" and $0.04 per "vibe request". On 15 September 2025 this became one credit pool **charged fractionally by prompt complexity**, with overage at **$0.04 per credit**. Tiers as of September 2026: Free 50 credits, Pro $20 for 1,000, Pro+ $40 for 2,000, Pro Max $100 for 5,000, Power $200 for 10,000. A GitHub issue titled "Your Pricing Is a Wallet-Wrecking Tragedy" shows user pushback. — [Kiro, important pricing updates](https://kiro.dev/blog/important-pricing-updates/) (summary); [morphllm Kiro pricing, Sep 2026](https://www.morphllm.com/kiro-pricing) (summary); [kirodotdev/Kiro#2182](https://github.com/kirodotdev/Kiro/issues/2182) (title only)
- Devin (Cognition): the ACU is "a normalized measure of the computing resources Devin uses to complete a task" (VM time, inference, bandwidth), about 15 minutes of active work, sold at $2.25 on Core and $2.00 on Teams. Self-serve plans have reportedly retired ACUs in favour of daily and weekly quotas plus extra usage at API pricing, with Cognition saying on-demand credits "are the same dollar value as the ACUs you're used to". — [fast.io ACU guide](https://fast.io/resources/devin-acu-guide/) (summary, aggregator); [agentcode.ai](https://agentcode.ai/devin-pricing) (summary, aggregator); **not confirmed on a Cognition page**
- Lovable: credits are per message or action. Pro includes 100 monthly credits that roll over while the subscription is active but expire 2 months after issue (annual plans: 1 month after the period ends). Top-ups last 12 months. The 5 daily bonus credits do not roll over. Downgrading to Free freezes credits until their original expiry date. Lovable shows a nudge in chat before credits expire. — [Lovable docs, credits and usage](https://docs.lovable.dev/introduction/credits-and-usage) (summary)
- Bolt.new sells raw **tokens** as the unit (Pro $25 for 10M tokens). Since 1 July 2025, paid tokens roll over for one extra month. Rollover needs an active subscription and is lost on cancellation. — [Bolt support, tokens](https://support.bolt.new/account-and-subscription/tokens) (summary); [Bolt pricing](https://bolt.new/pricing)
- Salesforce Agentforce Flex Credits (May 2025): $500 per 100,000 credits, so $0.005 per credit. A standard action costs 20 credits ($0.10) and a voice action 30 credits. The alternative model is $2 per conversation. — [Salesforce press release, 15 May 2025](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/) (summary); [Salesforce Help, Agentforce pricing](https://help.salesforce.com/s/articleView?id=004811240&language=en_US&type=1)
- Snowflake: credit price depends on edition, cloud and region, roughly $2.00-3.10 (Standard) up to $6.00-9.30 (VPS). Databricks DBUs run about $0.22 (jobs light) to $0.70 (serverless SQL), and the cloud infrastructure is billed separately. Snowflake credits include compute and DBUs do not, so the two units measure different things. — [select.dev](https://select.dev/posts/snowflake-pricing) (summary); [bigdataboutique](https://bigdataboutique.com/blog/databricks-vs-snowflake-2026-comparison-d731b5) (summary); third-party figures, not vendor rate cards
- Intercom Fin, an outcome unit priced in currency: **$0.99 per resolution**, charged once per conversation however many actions Fin takes. Other outcomes: $0.99 for a procedure handoff or disqualification, $9.99 for a lead qualification. Minimum of 50 outcomes per month. A resolution counts when the customer confirms the answer helped or leaves without asking for more help. — [Fin help, pricing outcomes](https://fin.ai/help/en/articles/13975800-fin-pricing-outcomes) (summary); [Intercom blog, outcome-based pricing for Fin for Sales](https://www.intercom.com/blog/building-outcome-based-pricing-for-fin-for-sales/)
- Market size: the PricingSaaS 500 Index lists 79 companies with a credit model, up from 35 at the end of 2024 (+126%), including Figma, HubSpot and Salesforce. About 29% of companies use AI credits and another 33% plan to within 6-12 months. — [Growth Unhinged, "Why everyone's switching to AI credits"](https://kylepoyar.substack.com/p/ai-credit-pricing) (summary); [Growth Unhinged 2026 State of B2B monetization](https://www.growthunhinged.com/p/the-state-of-b2b-monetization-in-2026) (summary)
- Twilio: I found no source in this session. Twilio is usually cited as a per-unit, currency-priced API (per message or minute) with prepaid account balances, but that is not verified here.

### Inferences
- The strongest 2026 signal is that the most-watched developer tools (Copilot, Cursor, Codex, Kiro overage) all **pegged the credit to a fixed currency amount**. Units that hid money (requests, checkpoints, effort, ACUs) were retired or reworked after complaints. Abstract units survive mostly in enterprise data platforms (Snowflake, Databricks), where contracts negotiate the exchange rate.
- Glide's delivery credit (S=1, M=3, L=8; about €15; charged only on acceptance) is an **outcome unit**, like Fin's resolution, not a compute unit. That is its strongest argument. Most backlash has been about compute credits whose burn the buyer cannot predict.
- Fin prices its outcome directly in currency ($0.99), with no credit layer. That is the closest precedent to Glide and shows an outcome price does not need a credit wrapper.

### Gaps
- Twilio credit model: not researched (no results).
- Cursor's current (2026) plan structure: the page could not be fetched, only the June 2025 change.
- Devin's retirement of ACUs is reported only by aggregators.

## 2. Evidence of buyer confusion and backlash, and practitioner advice on when credits fit

### Takeaway
Backlash follows three triggers: (1) a change that lowers effective value at the same price (Cursor 2025, Copilot 2026: "you get less but pay the same"); (2) a cost that is unknown until after the work runs (Replit, Kiro); (3) being charged for failures. Practitioners (Poyar, softwarepricing.com, Lago, Flexprice) agree that credits suit **multi-product, heterogeneous usage that needs one currency**. They also agree credits are a stopgap: they expose cost structure, invite exchange-rate games, and give buyers "how many credits do I need?" friction.

### Cited Findings
- Cursor: CEO Michael Truell wrote "We recognize that we didn't handle this pricing rollout well and we're sorry." Cursor refunded unexpected charges between 16 June and 4 July 2025. Users who expected "unlimited" saw bills several times their plan price. — [TechCrunch](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/) (summary); [Cursor blog](https://cursor.com/blog/june-2025-pricing) (summary)
- Replit: complaints included that the cost is unknown until after the task runs ("the Agent decides the effort") and that users are charged even when the task fails. Aggregators report 3-4x cost increases for power users, $0.25 tasks becoming $2, and a $350 bill in one day. — [usecarly.com](https://www.usecarly.com/blog/replit-agent-pricing-explained/) (summary, aggregator; anecdotal numbers); [InfoWorld](https://www.infoworld.com/article/4059876/replit-update-sparks-developers-dissatisfaction-over-pricing.html) (summary)
- Replit also had a billing bug: on 11 July a cost-calculation error overcharged about 6% of paying users, and all related charges were refunded. — [Replit effort-based pricing recap](https://replit.com/blog/effort-based-pricing-recap) (summary)
- Copilot: the April 2026 announcement drew the Visual Studio Magazine headline "You Will Get Less But Pay the Same Price", which went viral on Hacker News and r/programming. Heavy users face real bills and light users gain nothing. — [Visual Studio Magazine, 27 Apr 2026](https://visualstudiomagazine.com/articles/2026/04/27/devs-sound-off-on-usage-based-copilot-pricing-change-you-will-get-less-but-pay-the-same-price.aspx) (summary); [gapvelocity](https://www.gapvelocity.ai/blog/github-copilots-new-usage-based-billing-what-changed-why-developers-are-upset-and-what-it-means) (summary)
- Kyle Poyar (Growth Unhinged) recommends dollar-credit parity as "the simplest approach" (Lindy is roughly $1 per 100 credits) and notes most companies add volume discounts (Clay: 2,000 credits for $134, about $0.067 each, versus 50,000 for $720, about $0.014 each). He calls AI credits "great for vendors" but "a nightmare for customers" who juggle different credit models across many vendors, and describes credits as "a lifeline but not the AI pricing endgame". — [Growth Unhinged](https://kylepoyar.substack.com/p/ai-credit-pricing) (summary); [Poyar Substack note](https://substack.com/@kylepoyar/note/c-196463953) (summary)
- Critique from softwarepricing.com: credits replace "the harder work of choosing a metric that captures value". When credits track tokens, buyers can work out the markup. It lists six flaws: credits expose cost structure, become incomprehensible at scale, hide the pain of paying until renewal, invite exchange-rate manipulation, hide pricing problems behind prepaid cash, and cap revenue at infrastructure margins. — [softwarepricing.com, credit-based pricing for AI](https://softwarepricing.com/blog/credit-based-pricing-ai/) (summary)
- Lago and Flexprice: credits let customers move spend between features and act as one currency across products or regions, but credits that are too abstract create "how many credits do I need?" friction and slow adoption. — [Lago](https://getlago.com/blog/credit-based-pricing) (summary); [Flexprice](https://flexprice.io/blog/credit-based-pricing-vs-usage-based-pricing) (summary)
- Metronome (billing vendor) documents credits mainly as a mechanism: prepayment (often discounted), downtime reimbursement, promotions and prepaid commits. Each grant has start and expiry dates and a priority, and free ($0 cost basis) credits burn before paid ones. — [Metronome docs, prioritization rules](https://docs.metronome.com/guides/pricing-packaging/apply-credits-and-commits/prioritization-rules) (summary); [Metronome prepaid credits guide](https://docs.metronome.com/guides/pricing-packaging/billing-model-guides/prepaid-credits) (summary)
- Orb supports prepaid credit systems as a way to normalise different AI features into one currency. — [Orb blog, migrating to usage-based billing](https://www.withorb.com/blog/migrating-monthly-subscription-usage-based-ai-companies) (summary)
- OpenView: nothing current was found (OpenView wound down in 2024-2025, but that is not verified in this session).

### Inferences
- Glide already avoids the two worst triggers. Size is known **before** the Run (unlike Replit and Kiro), and the delivery fee is charged **only on acceptance** (unlike Replit charging for failures). The remaining risk is the "two meters" problem: tokens in euros per attempt plus a delivery fee in credits. The buyer has to add two units together to know what a ticket cost.
- The "credits hide markup" critique does not apply to Glide's delivery credit, because the token markup is already disclosed separately. It argues against ever denominating tokens in credits.

### Gaps
- No quantitative study (survey, churn data) comparing buyer comprehension of credits versus currency was found. The evidence is anecdotal and expert opinion.
- No direct Metronome or Orb essay on "when not to use credits" was retrieved.

## 3. Design choices: currency or outcome, multipliers, prepaid or postpaid, expiry and rollover, showing euros, bundles, conversion changes

### Takeaway
Current practice: peg the credit to a fixed currency amount, always show the currency next to it, offer volume discounts through larger bundles rather than a floating exchange rate, let paid credits roll over (usually with a long expiry for top-ups), and never change what a credit is worth without notice and a grandfathering period. In the EU, letting paid consumer balances expire is legally risky, and even in B2B it drives the backlash seen above.

### Cited Findings
- Examples of pegs: Copilot 1 credit = $0.01; Codex about $0.04; Kiro overage $0.04; Salesforce $0.005 (20 credits per $0.10 action). — sources in section 1 (summaries)
- Multipliers and rate cards: Codex publishes credits per 1M tokens for each model. Copilot's legacy premium requests used per-model multipliers, and AI Credits now bill premium models at higher rates. — [OpenAI rate card](https://help.openai.com/en/articles/20001106-codex-rate-card) (summary); [dev.to](https://dev.to/rebeca_vb/github-copilot-premium-requests-allowances-multipliers-billing-and-what-replaced-them-d3p) (summary)
- Volume pricing on credits: Clay's per-credit price falls about 4-5x from the smallest to the largest bundle. — [Growth Unhinged](https://kylepoyar.substack.com/p/ai-credit-pricing) (summary)
- Bonus credits as a volume lever: Copilot plans include more credit value than the plan price ($10 plan gets $15 of credits, $39 gets $70, $100 gets $200). — [search summary of GitHub announcement](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- Rollover and expiry: Lovable (monthly credits expire 2 months after issue, top-ups last 12 months, expiry nudge in chat); Bolt (one extra month of rollover, lost on cancellation). — sources in section 1
- Expiry ethics and law: under German law (§307 BGB), letting prepaid funds expire is generally an unfair disadvantage to the consumer. — search summary only; the source was not identified as primary, so **treat as unverified**. OpenAI API users have complained publicly about paid credits expiring. — [OpenAI community thread](https://community.openai.com/t/paid-credits-expired-wth/1041718) (title and summary)
- Prepaid mechanics: a prepaid model needs a positive balance before use, bought in batches at signup, with ad-hoc top-ups. — [Metronome prepaid guide](https://docs.metronome.com/guides/pricing-packaging/billing-model-guides/prepaid-credits) (summary)
- Break-even comparison as a transparency practice: agencyq shows that above about 20 actions per interaction, Salesforce's $2 per conversation is cheaper than $0.10 per action. Buyers do this arithmetic themselves when two units coexist. — [agencyq](https://www.agencyq.com/insights/article/agentforce-flex-credits-real-cost-math) (summary)
- How to handle cost changes: Cursor (changed what $20 buys) and Copilot (changed what the subscription buys) both drew backlash. Cursor answered with refunds for the transition window. Copilot let annual plans keep the old model until renewal. — sources in section 2

### Inferences (applied to Glide)
- **Define one credit as one small (S) accepted pull request, with a fixed price in euros (for example "1 credit = €15").** Make it both an outcome unit and a currency peg. This is a stronger definition than a pure currency peg because the credit names what the buyer gets, and it avoids an abstract unit because the euro value is fixed and shown.
- **Show euros next to credits everywhere**: "M · 3 credits (€45)". Invoices should list euros, with credits as a descriptive column.
- **Keep tokens out of credits.** Token pass-through stays in euros at cost plus a disclosed markup. Mixing tokens into credits would bring back the "hidden markup" and "exchange-rate manipulation" critique.
- **Prepaid or postpaid**: because the fee is charged only on acceptance, postpaid (invoice accepted PRs monthly) is the most natural and fairest option. Offer prepaid bundles only as a discount vehicle (for example 50 credits for €675, which is €13.50 each). If bundles are sold, paid credits should not expire while the account is active, or should last at least 12 months like Lovable top-ups, with advance notice. Promotional or free credits can expire and should burn first, following Metronome's pattern.
- **When underlying costs change**: the delivery credit is not tied to token cost, so model price changes do not have to move it. If the euro value of a credit changes, grandfather credits already bought at the old value, announce ahead, and change the euro price rather than the S/M/L credit counts. Changing the counts is the "you get less for the same" move that triggered the Copilot and Cursor backlash.

### Gaps
- No verified primary source on EU or Dutch law on expiry of B2B prepaid credits. The German §307 BGB claim comes from a search summary. Dutch and EU B2B treatment should be checked with counsel.
- No data on how often vendors grandfather credits when the peg changes.

## 4. Sizing: how outcome-priced products assign size, and whether 1/3/8 is sensible compared with 1/3/10

### Takeaway
Agile practice uses coarse, widening scales because uncertainty grows with size. A 1/3/8 ladder is a subset of Fibonacci (1, 2, 3, 5, 8, 13) and is defensible for that reason. No sourced AI product was found that fixes a price by pre-estimated size. Vendors either meter afterwards (Replit, Kiro: charged fractionally by complexity) or charge per outcome at a flat price (Fin). Glide's pre-sized flat fee sits between the two and is uncommon.

### Cited Findings
- The gaps in the Fibonacci scale widen because uncertainty grows with size. Arguing whether a story is 1 or 2 points is meaningful, while 20 versus 21 is false precision. — [LogRocket](https://blog.logrocket.com/product-management/fibonacci-story-points-guide/) (summary); [toolsbase](https://toolsbase.dev/en/blog/story-points-guide) (summary)
- T-shirt sizes are low-confidence, early estimates, typically at initiative level. Fibonacci points are used for granular user stories. — [producthabits](https://producthabits.com/engineering-estimates/) (summary); [Kollabe](https://kollabe.com/posts/t-shirt-sizing-vs-fibonacci) (summary)
- Kiro prices by prompt complexity after the fact (fractional credits). Replit prices by agent-determined effort. Both drew complaints about unpredictability. — sources in sections 1 and 2
- Codex's illustrative cost ratio: a small bug fix is about 10 credits and a multi-file refactor about 60, a 6x spread. — [Taskade](https://www.taskade.com/blog/codex-pricing-explained) (summary, aggregator)

### Inferences
- **1/3/8 compared with 1/3/10.** Both are geometric (about 3x and 2.7x steps for 1/3/8; 3x and 3.3x for 1/3/10). 1/3/8 matches the Fibonacci values teams already use in Jira, so agencies can map their story points directly (1 means S, 2-3 means M, 5-8 means L). 1/3/10 is easier to calculate in euros (€15/€45/€150) but charges L relatively more. The choice should follow Glide's own data, not taste:
  - (a) the median token cost and review effort of accepted L tickets compared with S tickets;
  - (b) how often tickets are mis-sized.

  If L tickets are routinely underestimated, a larger multiplier over-charges on every mis-sizing where L was really M. That favours the smaller ratio (8).
- The fairness of pre-sizing depends on **who sets the size and when**. Recommendation: the size is shown and locked before the Run, and the agency can dispute it, or re-size before accepting the PR. An AI-estimated size should be shown as a proposal the agency confirms. That avoids the Replit "unknown until after" complaint.
- Consider rejecting or splitting anything above L, instead of adding an XL tier. Wider tiers mean higher variance and more disputes.

### Gaps
- No public example of an AI coding product with fixed pre-sized, per-outcome delivery fees was found, so there is no direct benchmark for the ratio.
- No empirical data on the actual cost ratio across ticket sizes for coding agents. The Codex 10 versus 60 figures are illustrative only.

## 5. Recommendation criteria: when to drop credits and show euros only

### Takeaway
Credits earn their place when they (a) unify several different billable things into one balance, (b) let a buyer prepay or receive a pool once and spend it flexibly, or (c) name an outcome more clearly than a price does. When there is a single billable outcome with a fixed euro price and postpaid billing, credits add a conversion step without benefit, and euros alone (as Fin does with $0.99 per resolution) are clearer.

### Cited Findings
- Credits fit multi-product or heterogeneous usage as a single currency. — [Lago](https://getlago.com/blog/credit-based-pricing) (summary); [Orb](https://www.withorb.com/blog/migrating-monthly-subscription-usage-based-ai-companies) (summary)
- Abstract credits create "how many do I need?" friction. — [Flexprice](https://flexprice.io/blog/credit-based-pricing-vs-usage-based-pricing) (summary)
- Credits are "a lifeline but not the endgame", and managing many vendors' credit systems is a nightmare for buyers. — [Growth Unhinged](https://kylepoyar.substack.com/p/ai-credit-pricing) (summary)
- Outcome pricing shown directly in currency works at scale (Fin at $0.99 per resolution, with a minimum of 50 outcomes per month). — [Fin help](https://fin.ai/help/en/articles/13975800-fin-pricing-outcomes) (summary)

### Inferences (a decision test for Glide)
Keep credits if **at least one** of these is true or planned:
1. Glide sells prepaid bundles or plan-included allowances (for example "20 credits per month included") with a discount or commitment.
2. Agencies resell or allocate credits to their own clients or projects (credits as an internal budget currency). This is plausible for agencies and a real advantage.
3. More billable outcome types will share one balance (for example reviews, migrations, test-suite generation).
4. Glide wants a price that holds across currencies (credits priced per region).

Drop credits and show euros only ("S €15 · M €45 · L €120, charged when you accept the PR") if **none** of these apply: billing stays postpaid, there is a single outcome type, and there is a single currency.

If credits are kept:
- Define 1 credit as "one small accepted PR, €15".
- Always show the euro amount next to it.
- Keep token pass-through in euros and outside credits.
- Paid credits never silently expire.
- Grandfather credits when the euro price changes.
- Lock the size before the Run and let the agency dispute it.

### Gaps
- No direct buyer research on agencies specifically (for example whether agencies prefer credits for rebilling to their clients). This is worth testing in customer interviews.
