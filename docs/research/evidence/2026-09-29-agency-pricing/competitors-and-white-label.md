# Competitors and White-Label: AI Ticket-to-PR Agents, Pricing and Agency Go-to-Market (as of 2026-09-29)

Method note: the network egress proxy blocked direct fetches of every vendor site tried (devin.ai, factory.ai, openai.com, duda.co, sourcegraph.com, multica.ai, windowsforum.com). Findings below come from web-search result extracts. Official pages that appeared in results (devin.ai/pricing, docs.factory.ai/pricing, kiro.dev/pricing, docs.warp.dev, developers.openai.com/codex/pricing, lovable.dev/partners, wpengine.com, webflow.com, blog.replit.com, docs.github.com) are cited where they were among the results. Many numbers still come from third-party pricing aggregators, which are often SEO content and can be stale. Treat any figure cited only to an aggregator as "verify before publishing". Prices are USD unless stated otherwise.

## Q1. Pricing unit, price points and tiers per competitor

### Takeaway
Every major hosted agent now bills on a metered unit layered on top of a subscription: ACUs (Devin), tokens or credits (Copilot, Codex, Cursor, Kiro, Warp, Lovable, Bolt, v0) or rolling rate limits (Factory). Only Jules sells a count of tasks. In spring and summer 2026 the market shifted away from request- or message-based units toward token-aligned credits. GitHub switched on 2026-06-01, OpenAI Codex on 2026-04-02 and Replit on 2026-07-01, and Cognition and Factory both repackaged in April 2026. None of these vendors publishes a price per ticket or per PR.

### Cited Findings

**Devin (Cognition): ACU plus subscription**
- There are 5 plans: Free $0, Pro $20/mo, Max $200/mo, Teams with an $80/mo minimum and full developer seats at $40/mo each, and custom Enterprise. Pro and Teams seats use daily and weekly quotas. Max has a weekly allowance with no daily cap. Enterprise is billed in ACUs at the order-form rate. Cognition announced these tiers in April 2026, replacing per-ACU self-serve pricing. — [Lindy](https://www.lindy.ai/blog/devin-pricing); official page in results: [devin.ai/pricing](https://devin.ai/pricing) (not fetchable)
- Earlier (pre-April 2026) pricing had Core at $20/mo with pay-as-you-go at $2.25/ACU, and Team at $500/mo including 250 ACUs at $2.00 each. 1 ACU is roughly 15 minutes of active autonomous work. — [Lindy](https://www.lindy.ai/blog/devin-pricing); [usecarly](https://www.usecarly.com/blog/devin-pricing/). Several 2026 aggregators still quote this older structure, so the sources conflict.
- For historical context (Dec 2024), the original Devin team plan was $500/mo. A user computed 3,750 ACU-minutes, about $8/hour. — [X post, @ai_for_success](https://x.com/ai_for_success/status/1866539875958394976)

**Factory (Droids): seats plus rolling rate limits**
- Self-serve seats are Pro $20/mo, Plus $100/mo and Max $200/mo with no mandatory usage charge. Teams costs $60/mo per team plus $40/mo per seat, up to 10 seats. Business and Enterprise are custom. Plus gives about 5x Pro usage and Max about 10x, and both add Factory-managed "Droid Computers" for remote agents. Around April 2026 (alongside a reported $150M Series C) Factory replaced token-metered tiers with this model. Free "Droid Core" models and opt-in "Extra Usage" credits sit beyond the limits. — [Kunavo](https://kunavo.com/guides/factory-droid-pricing); official in results: [docs.factory.ai/pricing](https://docs.factory.ai/pricing)
- The older model offered Pro with 20M tokens and overage at $2.70 per 1M tokens. A user praised the $100 plan as "super transparent pricing... 100M tokens (codex 5.5 and opus 4.7 = 2x)". — [X, @Ra1kshit](https://x.com/Ra1kshit/status/2050551221627523202); [Kunavo](https://kunavo.com/guides/factory-droid-pricing)

**GitHub Copilot coding agent (cloud agent): AI Credits since 2026-06-01**
- On 2026-06-01 GitHub replaced Premium Request Units with "GitHub AI Credits", billed per token at 1 credit = $0.01. Plan prices did not change. The docs on premium requests are now labelled "legacy". — [docs.github.com (legacy requests)](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests); [UsageBox](https://usagebox.com/articles/github-copilot-usage-based-billing-2026)
- Tiers: Free $0; Pro $10/mo including $15 of credits; Pro+ $39/mo including $70; Max $100/mo including $200; Business $19/user/mo; Enterprise $39/user/mo. Completions stay unlimited. Chat, agent mode, code review, cloud agents, CLI, Spaces, Spark and third-party coding agents all draw on credits. — [NoCode MBA](https://www.nocode.mba/articles/github-copilot-pricing); [daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl)
- One agent session producing a meaningful diff on a strong model costs 600–1,200 credits ($6–12). Copilot code review has two meters: AI Credits for tokens plus GitHub Actions minutes. — [daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl); [Codacy](https://blog.codacy.com/github-copilot-code-review-used-to-be-included-from-june-1st-you-pay-twice)

**Cursor (background/cloud agents): usage credit pool**
- As of Sept 2026: Hobby is free, individual tiers cost $20, $60 and $200/mo, Teams is $40/user/mo, and Enterprise is custom. Each plan includes a credit pool roughly equal to its price, with on-demand usage after that. Cursor's own guidance is about $20 for daily Tab users, $60–100 for daily Agent users and "$200 or more" for anyone running multiple agents. — [Jetadmin](https://www.jetadmin.io/blog/untitled-31/); [Finout](https://www.finout.io/blog/what-happened-to-cursor-pricing-2026-guide-5-cost-cutting-tips); official docs in results: [cursor.com/docs/models-and-pricing](https://cursor.com/docs/models-and-pricing)

**OpenAI Codex (cloud): bundled in ChatGPT plus credits**
- Codex is bundled into ChatGPT plans: Free $0, Go $8, Plus $20, Pro $100/$200, and Business $20/user/mo billed annually. On 2026-04-02 OpenAI retired per-message limits for Plus, Pro and Business and moved to API-aligned credits (about $0.04 each) on a rolling 5-hour window. Business and Enterprise/Edu have a published credit rate card. — [Taskade](https://www.taskade.com/blog/codex-pricing-explained); [Morph](https://www.morphllm.com/codex-pricing); official in results: [developers.openai.com/codex/pricing](https://developers.openai.com/codex/pricing), [OpenAI Help: Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card)
- On 2026-09-10 OpenAI reportedly paused new sign-ups and upgrades to Pro $200. — [Morph](https://www.morphllm.com/codex-pricing) (single secondary source, unverified)
- A typical session costs $0.50–2.00. Teams report about $100–200 per developer per month. — [CloudZero](https://www.cloudzero.com/blog/openai-codex-pricing/)

**Google Jules: tasks per day (the only task-count unit)**
- Free: 15 tasks/day, 3 concurrent (Gemini 3 Flash). AI Pro at $19.99/mo: 100 tasks/day, 15 concurrent. AI Ultra at $124.99/mo: 300 tasks/day, 60 concurrent. Jules is bundled in Google AI subscriptions, and limits are per user rather than pooled. — [HackUp (July 2026)](https://hackup.ai/ai-plans/jules/); [Morph](https://www.morphllm.com/comparisons/jules-google-coding-agent); GA launch Aug 2025: [TechCrunch](https://techcrunch.com/2025/08/06/googles-ai-coding-agent-jules-is-now-out-of-beta)

**Amazon Kiro (successor branding for Q Developer's agentic IDE): credits**
- Free has 50 credits/mo. Pro is $20 for 1,000 credits, Pro+ $40 for 2,000, Pro Max $100 for 5,000 and Power $200 for 10,000. Overage costs $0.04/credit, twice the effective $0.02 in-plan rate, and is off by default. Add-on packs run from $5 (125 credits) to $100 and are valid for 12 months. A spec-task typically costs more than 1 credit. — [Morph, "September 2026"](https://www.morphllm.com/kiro-pricing); official in results: [kiro.dev/pricing](https://kiro.dev/pricing/), [Kiro blog](https://kiro.dev/blog/new-pricing-plans-and-auto/)

**Replit Agent: effort-based pricing**
- The Agent decides the effort, and the cost is known only after the task finishes. The model was introduced in 2025 and reached existing Core and Teams subscribers from 2026-07-01 (per usecarly). Each user request now produces one checkpoint whose compute cost varies. — [blog.replit.com effort-based pricing](https://blog.replit.com/effort-based-pricing); [docs.replit.com AI billing](https://docs.replit.com/billing/ai-billing); [usecarly](https://www.usecarly.com/blog/replit-agent-pricing-explained/)

**Lovable, Bolt and v0 (app builders)**
- Lovable costs Pro $25/mo and Business $50/mo. One credit balance now covers building, hosting, backend and in-app AI. Free has 5 build credits/day capped at 30/mo, plus 20 Cloud and 4 AI credits. The model changed in Aug 2026. — [Totalum](https://www.totalum.app/blog/lovable-pricing-2026); [UXMagic](https://uxmagic.ai/blog/lovable-pricing)
- Bolt.new costs Pro $25/mo and Teams $30/user/mo, with token-based usage. — [NoCode MBA](https://www.nocode.mba/articles/bolt-pricing-2026)
- v0 offers Free with $5 of credits and 7 messages/day, a $30/user/mo collaboration plan, Business at $100/user/mo and custom Enterprise. The $30 and Business plans include $30 of credits per user per month plus $2 in daily login credits. — [NoCode MBA](https://www.nocode.mba/articles/v0-pricing)

**OpenHands Cloud (All Hands): free BYOK plus self-hosted Enterprise**
- The Individual cloud plan is free with your own LLM key, or pay-as-you-go with the OpenHands LLM provider at cost. Enterprise is custom and adds self-hosted or VPC deployment, SSO and team billing. The paid "Growth" plan was discontinued in 2026. The core is open source. — [openhands.dev/pricing](https://www.openhands.dev/pricing); [aitoolsatlas](https://aitoolsatlas.ai/tools/openhands/pricing)

**Warp Oz (cloud agent orchestration): 3-bucket credits**
- Credits are metered in three buckets: AI (model), compute (sandbox) and platform (run lifecycle, integrations, dashboard, API, observability). Build is $18/mo for 1,500 credits, Max $180/mo for 18,000 credits, Business $50/user and Enterprise custom. Free gets 75 AI credits, 4 concurrent cloud agents and 3 indexed codebases. Reload credits roll over and expire after 12 months. — [docs.warp.dev credits](https://docs.warp.dev/support-and-community/plans-and-billing/credits/); [warp.dev/pricing](https://www.warp.dev/pricing); [Warp blog: Oz](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents)

**openai/symphony: open spec, no price**
- Symphony is an open-source specification (released around 2026-04-28) that turns a Linear board into a control plane for Codex agents. Each open issue gets a dedicated agent workspace. The orchestrator polls the board, restarts stalled agents and uses ticket status as a state machine. Some OpenAI teams saw a 500% increase in landed PRs in 3 weeks. There is no product price: cost is whatever Codex or ChatGPT usage it drives. — [Help Net Security](https://www.helpnetsecurity.com/2026/04/28/openai-symphony-codex-orchestration-linear/); [InfoWorld](https://www.infoworld.com/article/4164173/openais-symphony-spec-pushes-coding-agents-from-prompts-to-orchestration.html); [OpenAI](https://openai.com/index/open-source-codex-orchestration-symphony/)

**Multica: open-source, self-hostable human+agent project management**
- Multica describes itself as "Make humans and AI agents work as one team — open-source and self-hostable." Issues written as rough sentences end as PRs, and PRs that reference an issue ID link back with PR state and CI shown on the issue. — [GitHub multica-ai/multica](https://github.com/multica-ai/multica); [multica.ai](https://multica.ai/); [DEV deep dive](https://dev.to/truongpx396/multica-deep-dive-how-to-build-a-managed-agents-platform-54l2)

**Other ticket-to-PR tools**
- CodeRabbit Agent charges $0.40 per agent minute for cloud coding tasks. — [search extract citing coderabbit.ai/pricing](https://www.coderabbit.ai/pricing)
- Sweep is described (in an undated aggregator) as a GitHub app that turns GitHub issues and Jira tickets into PRs, posts a plan first and iterates on PR comments. — [aiagentslist](https://aiagentslist.com/agents/sweep-ai); [sweepai/sweep issues](https://github.com/sweepai/sweep/issues)
- Port publishes a guide for auto-resolving tickets with coding agents, and Augment Code publishes Jira-ticket-to-PR automation content. — [Port docs](https://docs.port.io/guides/all/automatically-resolve-tickets-with-coding-agents/); [Augment](https://www.augmentcode.com/guides/jira-ticket-to-pull-request-automation)

### Inferences
- The market standard is "subscription plus metered compute unit", and the unit is converging on dollar-denominated credits (GitHub at $0.01, Codex at about $0.04, Kiro at $0.02–0.04). A per-ticket price quoted before work starts (S/M/L) would be structurally different from every hosted competitor listed.
- Symphony, Multica and OpenHands commoditise the orchestration layer (tracker to agent to PR) as open source and self-hostable. Glide's defensible value is therefore unlikely to be "tracker to PR" alone. It is more likely to be budgets enforced before spend, delivery-based charging, a client portal, previews and white-labelling.

### Gaps
- Devin's April 2026 plans (Pro/Max/Teams) could not be verified against devin.ai (blocked), and aggregators disagree with each other.
- The current state of Sweep is unverified. The aggregator text is undated, and I found no 2026 primary source on whether Sweep still offers issue-to-PR.
- No pricing was found for Multica's hosted cloud, if one exists.
- The Amazon Q Developer standalone price in 2026 was not captured. Only Kiro was.
- Cursor's cloud-agent-specific per-run charges (such as a VM or compute surcharge) were not captured.

## Q2. Spend caps, cost predictability, per-task and outcome-based pricing, and user sentiment

### Takeaway
Unpredictable spend is the dominant complaint about agentic coding pricing: Devin ACUs, Replit effort-based pricing and Copilot AI Credits all drew it. Caps exist but are mostly account-level and monthly, reactive rather than per-task, and sometimes arrived late: Copilot's spending limit came on 2026-07-02, a month after metering began. The only outcome-based coding-agent price found is Sourcegraph's Agentic Batch Changes, which charges only for merged changesets. Jules is the only vendor pricing by task count.

### Cited Findings
- **Copilot:** reports say there was no automatic spending cap by default and overage billed until the user set a limit. GitHub added a spending-limit control on 2026-07-02 (Settings → Billing → Copilot, where $0 means a hard stop). Developers report monthly bills jumping from $29 to $750 and from $50 to $3,000. — [daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl); [fireup.pro](https://fireup.pro/news/github-copilot-ai-credits-billing-agent-mode-cost-2026) (the anecdotes are secondary)
- **Devin:** "Costs are unpredictable in a way you cannot budget" is a widely shared complaint about effort-based pricing. A mid-complexity feature can consume 30–60 ACUs ($67–135 at $2.25). Most users who report "surprise bills" hit overage within the first two weeks. Ambiguous tasks are the main cost driver. — [usecarly](https://www.usecarly.com/blog/devin-pricing/); [VibeAnswers](https://vibeanswers.com/devin/acu-usage-draining-fast/)
- **Replit:** The Register reported (2025-09-18) that Agent 3's effort-based pricing is "infuriating customers with surprise cost overruns". One user said "In the last week alone it charged me $1K... before it was never more than $180-200 a month." InfoWorld also covered developer dissatisfaction. — [The Register](https://www.theregister.com/2025/09/18/replit_agent3_pricing/); [InfoWorld](https://www.infoworld.com/article/4059876/replit-update-sparks-developers-dissatisfaction-over-pricing.html)
- **Kiro:** overage is disabled by default and must be switched on, which makes the plan allowance a hard cap by default. — [Morph](https://www.morphllm.com/kiro-pricing)
- **Factory:** the move to rate-limited seats "with no mandatory usage charge" gives a predictable seat price, with Extra Usage as an opt-in. — [Kunavo](https://kunavo.com/guides/factory-droid-pricing)
- **Cursor:** predictability "depends on managing model choices, context size, and background agents". — [Finout](https://www.finout.io/blog/what-happened-to-cursor-pricing-2026-guide-5-cost-cutting-tips)
- **Jules:** task-count pricing "structurally aligns cost with output rather than seat time". — [HackUp](https://hackup.ai/ai-plans/jules/)
- **Outcome-based:** Sourcegraph Agentic Batch Changes charges only when a generated changeset merges. Its blog is titled "Coding agents usually can't price on outcomes. Ours can." — [Sourcegraph blog](https://sourcegraph.com/blog/agentic-batch-changes-pricing) (content from search extract; the exact per-changeset price was not retrieved)
- Codacy argues cost per merged PR is the right metric because it ties AI spend to an outcome that has passed review. — [Codacy](https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026)
- **Per-minute:** CodeRabbit Agent charges $0.40 per agent minute. — [CodeRabbit pricing](https://www.coderabbit.ai/pricing)

### Inferences
- A per-run cap enforced before spend, combined with charging only on delivery, directly answers the most-cited complaint across Devin, Replit and Copilot. Only Sourcegraph, which targets large-scale batch refactors rather than agencies, uses a comparable outcome-based model.
- With delivery-only pricing, Glide carries the model-cost risk of failed runs. Ploeg's per-run caps are what bound that risk, so the caps are part of the business model and not only a technical feature.

### Gaps
- Sourcegraph's exact price per merged changeset and its conditions were not retrieved (site blocked).
- No Hacker News or Reddit threads were fetched directly. The sentiment above comes via press and aggregators.

## Q3. White-label and reseller programs (AI dev tools and adjacent agency software)

### Takeaway
None of the AI coding-agent vendors surveyed offers a true white-label edition. The closest are referral and partner commissions: Lovable pays 10–20%. White-labelling for agencies is mature in adjacent categories. GoHighLevel sells SaaS mode with usage rebilling at the agency's markup, and Duda has a White Label plan. Webflow and WP Engine pay referral commissions of 8–20%.

### Cited Findings
- **GoHighLevel:** full SaaS mode requires Agency Pro at $497/mo. It includes Stripe client billing, a plan configurator, automatic sub-account creation and rebilling of SMS, email and AI usage at an agency-set markup. The default markup is 1.05x, and typical agency markups are 1.5–3x. The $297 Unlimited plan gives visual white-labelling and unlimited sub-accounts, but rebilling happens at cost with no markup. — [SwitchToGHL](https://switchtoghl.com/ghl-saas-mode); [aigohighlevel](https://aigohighlevel.com/gohighlevel-white-label/); official: [HighLevel pricing and rebilling guide](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide)
- **Duda:** the White Label tier costs $149/mo and gives full platform branding, from the editor to client communications. The Agency and White Label plans include 4 free sites. Extra sites cost $17/mo or $168/yr. Custom plans negotiate tiered per-site pricing. Annual billing saves about 20–24%. Duda positions itself around a recurring-service model where agencies resell hosting and management. — [Duda pricing](https://www.duda.co/pricing); [Duda white label](https://www.duda.co/website-builder/white-label); [G2](https://www.g2.com/products/duda/pricing)
- **Webflow:** partners earn 10–20% commission on Site plans and add-ons. Foundations (entry level) pays 10%, and Certified Partners get up to 20%. — [Webflow Help: Certified Partner program](https://help.webflow.com/hc/en-us/articles/33961415802003-Webflow-Certified-Partner-program); [Webflow partners](https://webflow.com/solutions/partners)
- **WP Engine Agency Partner Program:** free to join, with tiers Member, Preferred, Advanced and Strategic. It pays recurring commission of 8%, 10% or 12% on referrals, monthly for up to 12 months per referred customer, plus discounts for agencies and their clients. — [WP Engine Agency Partner Program](https://wpengine.com/agency-partner-program/)
- **Lovable Partner Program:**
  - The Expert track is for independent experts and small agencies building sites, apps, client portals and internal tools. It pays 10% commission on referred Business plans.
  - The Solution Partner track has tiers at 0%, 10%, 15% and 20%. The commission is a one-time payment on contractual ARR of Enterprise deals, plus 10% on Business subscriptions sold, and partners keep their services revenue.
  - This is a referral and marketplace program, not white-label: the product stays Lovable-branded. — [lovable.dev/partners](https://lovable.dev/partners); [Lovable blog](https://lovable.dev/blog/introducing-lovable-partner-program); [rules reference](https://partner-program-rules.lovable.app/)
- **AI white-label platforms for agencies** exist for chatbots, voice agents and no-code agents, not coding agents. Pickaxe offers a branded hub on a custom domain with Stripe billing for subscriptions or usage credits. Synthflow provides white-label client dashboards and portals. Lety.ai agencies "typically resell each chatbot at $300 to $2,000 per month" (a vendor claim). Totalum offers a white-label AI app builder via API or MCP. — [Pickaxe](https://pickaxe.co/post/white-label-ai-tools-for-agencies); [Unite.AI Sept 2026](https://www.unite.ai/best-white-label-ai-tools/); [Lety](https://lety.ai/); [Totalum](https://www.totalum.app/blog/white-label-ai-app-builder-2026)
- Branding options are not the same as resale rights, which require a commercial reseller agreement. — [Totalum white-label guide](https://www.totalum.app/blog/white-label-ai-app-builder-2026)

### Inferences
- The proven agency white-label playbook, from GoHighLevel and Duda, has four parts: a flat platform fee, per-client or per-site units, agency-controlled retail pricing through the agency's own Stripe, and usage rebilling at a configurable markup. Glide's credits and S/M/L tickets map onto this pattern: the agency buys credits wholesale and sets its own client ticket prices.
- Referral commissions in dev and website tools cluster around 8–20%, which is a reference point for any Glide referral tier that sits alongside white-label.

### Gaps
- No white-label or reseller program was found for Devin, Factory, Cursor, Copilot, Codex, Jules, Kiro, Replit, Bolt, v0, Warp or OpenHands. The searches were not exhaustive, so this should be read as "not found", not "confirmed absent".
- Bolt's partner or agency program was not found.
- Duda and GoHighLevel wholesale discounts beyond list prices, which are negotiated on Custom plans, are not public.

## Q4. Is anyone targeting agencies specifically with AI dev agents?

### Takeaway
No hosted coding-agent vendor was found targeting web or software agencies with an agency product (client portal, per-client billing, white label). Agency targeting in AI shows up in two places. App builders such as Lovable run partner and expert marketplaces for agencies, and no-code chatbot and voice platforms offer white-label AI. A separate services market ("white-label development for agencies") sells human-delivered outsourced development.

### Cited Findings
- Lovable's Expert track explicitly targets "independent experts and small agencies building websites, apps, client portals, internal tools". A third party reported that Lovable is turning a large freelancer base (reported as 800,000) into a paid partner sales force. — [Lovable partners](https://lovable.dev/partners); [AlphaSignal](https://alphasignal.ai/news/lovable-turns-800-000-freelancers-into-a-paid-partner-sales-force) (the figure is secondary)
- Third-party guides such as "Lovable for Agencies: What Your Workspace Decides" discuss agencies using Lovable workspaces per client, which suggests the product lacks native multi-client agency structure. — [Axonbuild](https://axonbuild.com/blog/lovable-for-agencies)
- White-label AI roundups for agencies (Sept 2026) list chatbot, voice and agent platforms (Pickaxe, Synthflow, CustomGPT, Lety, White Label IQ, Agent One) and no coding agents. — [Unite.AI](https://www.unite.ai/best-white-label-ai-tools/); [Pickaxe](https://pickaxe.co/post/white-label-ai-tools-for-agencies)
- White-label development shops sell outsourced human dev work to agencies (for example Infomaze Elite and e2m's white-label Duda development). — [Infomaze](https://www.infomazeelite.com/white-label-development-agency-partners/); [e2m](https://www.e2msolutions.com/white-label-duda-development/)

### Inferences
- The "AI coding agent sold to agencies, resold to their clients under the agency's brand, priced per ticket" position appears unoccupied among the products surveyed. The nearest substitutes are human white-label dev shops, which have per-ticket or per-hour economics, and Lovable with its partner commissions.

### Gaps
- Small or niche startups pitching "AI dev agency in a box" may exist but did not surface. A dedicated search on Product Hunt, Y Combinator (YC) and similar sources is recommended.

## Q5. Positioning gaps Glide could exploit

### Takeaway
The gaps come directly from the findings above. Competitors bill for effort (tokens, ACUs, credits, minutes) with limited or reactive caps. They sell to individual developers or engineering orgs, not agencies. They offer no white label. The open-source orchestrators (Symphony, Multica, OpenHands) are self-hostable but have no commercial or agency layer.

### Cited Findings (evidence underpinning each gap)
- **Effort-based billing and surprise bills.** Devin, Replit and Copilot all bill for effort, and users report surprise bills. — [The Register](https://www.theregister.com/2025/09/18/replit_agent3_pricing/); [usecarly](https://www.usecarly.com/blog/devin-pricing/); [daily.dev](https://daily.dev/posts/github-copilot-billing-change-ai-credits-agent-mode-costs-and-how-to-set-a-spending-cap-hqf886txl)
- **Charging only on success is rare.** Sourcegraph's merge-only pricing is presented as unusual: "coding agents usually can't price on outcomes". — [Sourcegraph](https://sourcegraph.com/blog/agentic-batch-changes-pricing)
- **Tracker-driven orchestration is open source but product-less.** Symphony is a spec tied to Linear and Codex, and Multica is open source and self-hostable. — [InfoWorld](https://www.infoworld.com/article/4164173/openais-symphony-spec-pushes-coding-agents-from-prompts-to-orchestration.html); [Multica GitHub](https://github.com/multica-ai/multica)
- **Self-hosting sits behind custom Enterprise pricing** at OpenHands, and its mid-tier Growth plan was discontinued. — [OpenHands pricing](https://www.openhands.dev/pricing)
- **Agency white-label economics are proven in adjacent tools:** GoHighLevel with markup rebilling and Duda with its white-label tier and per-site units. — [SwitchToGHL](https://switchtoghl.com/ghl-saas-mode); [Duda](https://www.duda.co/pricing)

### Inferences (proposed positioning, not verified market fact)
1. **"Fixed price per ticket, charged on delivery."** S/M/L credits quoted before work starts, with no charge for undelivered work, contrast directly with ACU, effort-based and token pricing and their complaint history. Glide's per-run caps enforced before any money is spent are the mechanism that makes this safe for Glide.
2. **Agency-native multi-client structure.** A client portal, per-client credit wallets and reporting are not offered by any coding agent found. Lovable agencies work around workspaces.
3. **White-label and resell.** No AI coding-agent vendor offers it. Borrow the GoHighLevel pattern: the agency sets retail ticket prices, bills through its own Stripe, and keeps the margin over wholesale credits. Duda's roughly $149/mo white-label tier and GoHighLevel's $297 versus $497 split (markup rebilling only on the higher tier) are pricing anchors.
4. **Self-hostable on Kubernetes without enterprise-only gating.** This is a gap between open-source orchestrators, which have no commercial layer, and hosted agents, where self-hosting is enterprise-only.
5. **Tracker breadth where agencies live.** Symphony is Linear-centric and Jules, Copilot and Codex are GitHub-centric. Vikunja and ClickUp, both common in agencies, are underserved (inference: no competitor's ClickUp or Vikunja support was checked).
6. **Preview environment per PR for non-technical client sign-off.** This fits agencies' client-approval loop. Competitor preview support was not researched and needs verification.
7. **Price anchors for S/M/L tickets.** A Copilot agent session costs about $6–12 in credits, a Devin mid-complexity feature 30–60 ACUs (about $67–135), and a Codex session $0.50–2.00. These give rough cost floors per ticket size, but they come from secondary sources.

### Gaps
- No agency interviews or surveys on willingness to pay per ticket were found.
- Competitor support for preview environments and for ClickUp or Vikunja integrations was not checked.
- All vendor sites were blocked from direct fetching, so prices should be re-verified against the official pages before external use.
