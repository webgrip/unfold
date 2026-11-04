# Commerce and payments

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Adyen Agentic { #adyen-agentic }

Not to be confused with: Adyen's Agentic Feed, Agentic Cart and Agentic Payments APIs. Adyen is Dutch, but the launch is US-only.

| | |
| --- | --- |
| Steward | Adyen (single-vendor) |
| Status | draft |
| Latest | [limited availability 2026-06-16](https://www.adyen.com/press-and-media/adyen-agentic) |
| Radar | **hold**: Fit decided it: US enterprise only, no EU date, and no iDEAL or Wero. |
| Moves when | Adyen announces EU availability of Adyen Agentic. |
| Competes with | [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite), [Mollie agentic commerce (ACP delegated payments, Mollie MCP server)](commerce.md#mollie-agentic) |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [Agent Payments Protocol (AP2)](commerce.md#ap2), [Agentic Commerce Protocol (ACP)](commerce.md#acp) |
| Builds on | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No fit for Unfold billing | Credits billing | Record that Adyen targets enterprise merchants, not Unfold's Credits. | S | Saves effort. |
| Enterprise Client review | Agency Work Item type | Proposed reading Work Item: for an Adyen Client selling in the US, list what Agentic Feed and Cart need. | S | Serves the few Agencies with enterprise Clients. |
| Agentic Feed for a US Client | Agency's Client webshop | Proposed: publish a Client catalog through Adyen's feed. | M | Only for Clients in Adyen's limited availability. |
| UCP via Adyen | Agency's Client webshop | Proposed: use Adyen as the UCP payment handler once offered in the EU. | L | A Dutch PSP route when it arrives. |
| Watch for an EU date | Agency Work Item type | Proposed: no template until Adyen states EU availability. | S | Avoids unavailable work. |

**Shipped adoption:** Supports UCP, AP2, ACP and Meta AI checkout. Partners include Amex, Mastercard, Salesforce and Visa. Retailers include ESW, Scheels, Sézane and SharkNinja. US enterprise only (https://www.adyen.com/press-and-media/adyen-agentic).; ABSENT: no iDEAL or Wero mention, and no EU date.

**Open problems:** No EU timeline (https://www.adyen.com/press-and-media/adyen-agentic).

**Watched:** changelog-page `https://www.adyen.com/press-and-media`, github-releases `Adyen/adyen-php-api-library` at v30.1.0

## Agent Payments Protocol (AP2) { #ap2 }

Not to be confused with: Mandate-based (Intent/Cart/Payment mandates, verifiable credentials) payment authorisation layer for agents. Not a checkout protocol.

| | |
| --- | --- |
| Steward | Google, contributed to the FIDO Alliance Payments Technical WG on 2026-04-28 (foundation) |
| Status | draft |
| Latest | [v0.2.0 2026-04-28](https://github.com/google-agentic-commerce/AP2/releases) |
| Radar | **assess**: Maturity decided it: v0.2.0 with a pending move to FIDO and no published FIDO spec. |
| Moves when | FIDO publishes an agent payments specification that includes AP2 mandates. |
| Competes with | — |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [Verifiable Intent](commerce.md#verifiable-intent), [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0007-clients-approve-ready-work](../../../../../docs/adr/adr-0007-clients-approve-ready-work.md), [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Mandate model as a reference for Quote approval | Client Portal | Proposed: compare AP2's Intent and Cart mandates with ADR-0007's Quote approval, so a future agent acting for a Client approves within a signed limit. | S | Informs how a Client's agent could approve a Quote safely. |
| Agent-paid Credits top-up, later | Credits billing | Proposed: if an Agency's agent tops up Credits, require an AP2-style mandate bound to the Agency Budget (ADR-0006). | M | Keeps automatic top-ups inside an explicit human grant. |
| AP2 through UCP for a Client shop | Agency's Client webshop | Proposed: accept AP2 payment mandates in a Client's UCP checkout once its PSP supports them in the EU. | L | Prepares Clients for agent payments without a human present. |
| Mandate audit trail | Agency Work Item type | Proposed: a Work Item that stores mandates with orders for a Client's dispute handling. | M | Gives Clients Evidence in disputes over agent purchases. |
| Watch the FIDO move | Agency Work Item type | Proposed: no template until a FIDO spec is published. | S | Avoids building on a spec in transit. |

**Shipped adoption:** v0.2.0 adds Human Not Present flows (https://github.com/google-agentic-commerce/AP2/releases).; Used by UCP for payment mandates (https://ucp.dev). Supported by Adyen Agentic (https://www.adyen.com/press-and-media/adyen-agentic).

**Open problems:** The repo does not reflect the FIDO move. No FIDO spec published since April [secondary] (https://ppc.land/fido-alliance-forms-working-groups-to-lock-down-ai-agent-payments/).

**Watched:** github-releases `google-agentic-commerce/AP2` at v0.2.0, changelog-page `https://www.fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/`

## Agentic Commerce Protocol (ACP) { #acp }

Not to be confused with: OpenAI and Stripe spec (Agentic Checkout API, Delegate Payment API, product feed). Not IBM/BeeAI 'Agent Communication Protocol'.

| | |
| --- | --- |
| Steward | OpenAI and Stripe (Founding Maintainers) (consortium) |
| Status | stabilising |
| Latest | [2026-04-17 (labelled beta) 2026-04-17](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) |
| Radar | **hold**: Fit decided it: its flagship checkout was scaled back, no EU launch is confirmed, and UCP has wider PSP support. |
| Moves when | OpenAI launches agent checkout in the EU, or ACP moves to a neutral foundation. |
| Competes with | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Complements | [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No ACP for Unfold's own billing | Credits billing | Record that Credits are not sold through agent checkout. | S | Avoids work on a retreating consumer surface. |
| Product feed for OpenAI discovery | Agency Work Item type | Proposed Work Item template: publish an OpenAI product feed for a Client shop, which still serves discovery. | S | Keeps Clients visible in ChatGPT shopping. |
| ACP delegated payment via Mollie | Agency's Client webshop | Proposed: only if Mollie documents its ACP API, connect a Mollie Client's checkout to it. | M | Would give Dutch Mollie shops an agent payment route. |
| Protocol choice review | Agency Work Item type | Proposed reading Work Item: compare ACP and UCP for a Client and recommend UCP unless the Client sells mainly in ChatGPT. | S | Saves Clients from building both. |
| Name disambiguation in Unfold docs | Unfold docs | Unfold already uses ACP for the Agent Client Protocol (ADR-0050); docs name the commerce one in full to avoid confusion. | S | Prevents a costly misreading in Work Items and docs. |

**Shipped adoption:** Spec files under spec/2026-04-17/openapi. No GitHub releases. Last commit 2026-07-18 (https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/commits/main).; ChatGPT Instant Checkout deprioritised 2026-03-24/25, refocused on discovery [secondary] (https://macrumors.com/2026/03/25/chatgpt-revamps-shopping-features).; Mollie built an ACP-compatible delegated payments API, 2025-11-24 (https://ffnews.com/newsarticle/paytech/mollie-ready-for-ai-payments-before-openai-launches-in-europe/).; Adyen Agentic supports ACP (https://www.adyen.com/press-and-media/adyen-agentic).; OpenAI commerce docs: Feeds API, Agentic Checkout Spec, Delegated Payment Spec (https://developers.openai.com/commerce).

**Open problems:** Its flagship consumer surface was scaled back. The plan to move to a neutral foundation has not been executed (https://github.com/agentic-commerce-protocol/agentic-commerce-protocol).; ABSENT: no confirmation that OpenAI checkout launched in the EU.

**Watched:** changelog-page `https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/changelog`

## Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit) { #card-network-agentic-tokens }

Not to be confused with: Network tokens bound to an agent and a consent, provisioned by PSPs and issuers. Merchants receive them via the PSP.

| | |
| --- | --- |
| Steward | Visa, Mastercard, American Express (single-vendor) |
| Status | stabilising |
| Latest | [Visa live EU agentic transactions 2026-07-02](https://www.visa.co.uk/about-visa/newsroom/press-releases.3457328.html) |
| Radar | **assess**: Fit decided it: live in Europe but delivered by PSPs, with nothing for Unfold to build and cards a minority method in Dutch shops. |
| Moves when | Mollie or another Dutch-market PSP documents agentic network tokens for merchants. |
| Competes with | [iDEAL \| Wero (EPI Wero migration)](commerce.md#ideal-wero) |
| Complements | [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite), [Agent Payments Protocol (AP2)](commerce.md#ap2), [Verifiable Intent](commerce.md#verifiable-intent), [Visa Trusted Agent Protocol (TAP)](commerce.md#visa-tap), [Mastercard Agent Pay](commerce.md#mastercard-agent-pay) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Nothing to build for Credits | Credits billing | Record that agent tokens arrive through the PSP; Unfold's Mollie integration needs no change. | S | Clarity that no work is owed. |
| PSP setting review for Clients | Agency Work Item type | Proposed reading Work Item: check that a Client's PSP accepts agentic network tokens and passkey SCA. | S | Clients accept agent card payments already live in Europe. |
| Order tagging for agent payments | Agency's Client webshop | Proposed: record whether a payment came from an agent token, from PSP data, in the Client's order system. | M | Lets Clients measure agent sales. |
| Fraud rules for agent orders | Agency's Client webshop | Proposed: adjust a Client's fraud rules for Human Not Present card payments. | M | Reduces false declines on agent orders. |
| Payment mix advice | Agency Work Item type | Proposed: explain to Dutch Clients that cards are a minority method next to iDEAL, so agent tokens reach few shoppers. | S | Sets realistic expectations. |

**Shipped adoption:** Visa: live agentic transactions across Europe with 30+ issuers (lastminute.com, Frasers), Visa Payment Passkeys for SCA, Paris 2026-07-02 (https://www.visa.co.uk/about-visa/newsroom/press-releases.3457328.html). Agentic Ready programme, Europe first (https://www.visa.co.uk/about-visa/newsroom/press-releases.3437886.html). Intelligent Commerce Connect, 2026-04-09 (https://www.visa.co.uk/about-visa/newsroom/press-releases.3442048.html).; Mastercard: all European issuers enabled at network level for Agent Pay. The list of banks with live transactions includes bunq (https://newsroom.mastercard.com/news/europe/en/perspectives/en/2026/europe-is-building-the-foundations-for-trusted-agentic-commerce/, 2026-06-02). First NL agent payment with Rabobank, 2026-04-30 [secondary] (https://ppc.land/mastercard-and-rabobank-complete-first-ai-agent-payment-in-the-netherlands/).; Stripe SPT can be backed by these tokens (https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens).

**Open problems:** The Visa, Mastercard and Ant 'know your agent' framework (2026-09-10) has no spec [secondary] (https://www.pymnts.com/cybersecurity/2026/visa-mastercard-team-with-ant-know-your-agent-framework).; Cards are a minority method in NL webshops compared with iDEAL. No figure was retrieved in this research.

**Watched:** changelog-page `https://newsroom.mastercard.com/news/europe/en/`

## EU PSD3 and Payment Services Regulation (PSR) { #psd3-psr }

Not to be confused with: EU law, not a protocol. Relevant to SCA, liability and the 'commercial agent' exclusion for agent-initiated payments.

| | |
| --- | --- |
| Steward | European Parliament and Council (procedures 2023/0209(COD), 2023/0210(COD)) (sdo) |
| Status | stabilising |
| Latest | [Council first-reading positions adopted (A-items) 2026-10-29](https://data.consilium.europa.eu/doc/document/ST-14536-2026-INIT/en/pdf) |
| Radar | **assess**: Maturity decided it: Council positions are adopted but nothing is in the Official Journal and agent payments are not addressed. |
| Moves when | PSD3 and PSR are published in the Official Journal. |
| Competes with | — |
| Complements | [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens), [Agent Payments Protocol (AP2)](commerce.md#ap2), [iDEAL \| Wero (EPI Wero migration)](commerce.md#ideal-wero) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| SCA in Credit purchases | Credits billing | Proposed: rely on Mollie for SCA on Credit purchases and recheck when PSR applies (around 2028). | S | Keeps billing compliant without own code. |
| No agent-initiated Credit purchases | Credits billing | Proposed: until liability for agent payments is settled, only people buy Credits; the Agency Budget caps usage (ADR-0006). | S | Avoids an unresolved legal risk. |
| Impact review for Clients | Agency Work Item type | Proposed reading Work Item: summarise PSD3 and PSR changes for a Client's checkout and refunds. | S | Agencies advise Clients ahead of 2028. |
| Fraud-sharing and refund rules | Agency's Client webshop | Proposed: adapt a Client's refund flow once the final text is published. | M | Prepares Clients for new obligations. |
| Watch Official Journal | Credits billing | Proposed: revisit when the texts are published. | S | Times work to legal dates. |

**Shipped adoption:** "Council list of A-items, 2026-10-29: adoption of the Council's position at first reading for PSD3 and PSR, approved by Coreper on 2026-10-28 (https://data.consilium.europa.eu/doc/document/ST-14536-2026-INIT/en/pdf)."; "ABSENT: not yet in the Official Journal. General application is expected around 2028 (about 21 months after entry into force) [secondary] (https://www.deloitte.com/nl/en/services/legal/services/preparing-for-psd3-psr.html)."; "ABSENT: no agent-specific SCA provisions found. Commentary says PSD3 assumes a human initiator (https://brc.org.uk/news-and-events/news/associate-insight/2026/psd3-agentic-commerce-and-the-new-frontier-of-payment-risk/)."

**Open problems:** "Liability and SCA for Human Not Present agent payments are unresolved (https://brc.org.uk/news-and-events/news/associate-insight/2026/psd3-agentic-commerce-and-the-new-frontier-of-payment-risk/)."; "The commercial-agent exclusion is limited to agents acting for one side only [secondary] (https://www.freshfields.com/en/our-thinking/blogs/risk-and-compliance/psd3-psr-what-the-eus-new-payments-rules-mean-for-your-business-102mrom)."

## Google UCP-powered checkout and Merchant Center agent attributes { #google-merchant-ucp }

Not to be confused with: Google's implementation of UCP checkout in AI Mode and Gemini, configured via Merchant Center attributes. Not the UCP spec itself.

| | |
| --- | --- |
| Steward | Google (single-vendor) |
| Status | stabilising |
| Latest | [native_commerce(checkout_eligibility:cart_eligibility) 2026-11-04](https://developers.google.com/merchant/ucp/guides/merchant-center) |
| Radar | **hold**: Fit decided it: US, Canada and Australia only, and Unfold's Agencies sell mostly to Dutch shoppers. |
| Moves when | Google lists the Netherlands or the EU as eligible for UCP checkout. |
| Competes with | [Agentic Commerce Protocol (ACP)](commerce.md#acp) |
| Complements | [Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy)](commerce.md#schema-org-commerce), [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Builds on | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [Agent Payments Protocol (AP2)](commerce.md#ap2) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No Google agent checkout for Unfold | Credits billing | Record that Unfold sells B2B services, which the programme excludes. | S | Avoids a dead end. |
| Merchant Center attribute prep for a Client | Agency Work Item type | Proposed Work Item template: add return policy, support contact, merchant_item_id and variant_option to a Client's supplemental feed, useful now for Merchant Center and later for checkout. | S | Work that pays off before agent checkout reaches the Netherlands. |
| Eligibility review for a Client selling to the US | Agency's Client webshop | Proposed reading Work Item: check whether a Client that sells in the US, Canada or Australia qualifies and what its PSP needs. | S | Finds the few Clients who can use it today. |
| native_commerce attribute setup | Agency's Client webshop | Proposed: configure the composite attribute and Google Pay integration for an eligible Client. | M | Opens a sales channel for Clients outside the EU. |
| Watch EU availability | Agency Work Item type | Proposed: no NL template until Google opens the programme here. | S | Keeps Agencies from selling unavailable work. |

**Shipped adoption:** "Eligible only for products sold in the US, Canada and Australia. Interest form required (https://support.google.com/merchants/answer/16837055?hl=en)."; "Requirements: return policy (cost, window, link), customer support contact, native_commerce composite attribute, consumer_notice, merchant_item_id, variant_option. Supplemental feed recommended (https://developers.google.com/merchant/ucp/guides/merchant-center)."; "Payment: FPANs from Google Wallet. Needs a Google Pay & Wallet Console account. The PSP must be Google Pay integrated (https://support.google.com/merchants/answer/16837055?hl=en)."; "ABSENT: no Netherlands or EU availability."

**Open problems:** "Excludes subscriptions, installments, services, rentals and pre-orders (https://developers.google.com/merchant/ucp/guides/merchant-center)."; "The help page shows no last-updated date. latest.date is the check date, not a release date."

**Watched:** changelog-page `https://developers.google.com/merchant/ucp/guides/merchant-center`, changelog-page `https://support.google.com/merchants/answer/16837055?hl=en`

## iDEAL \| Wero (EPI Wero migration) { #ideal-wero }

Not to be confused with: The Dutch account-to-account payment rail migrating into EPI's Wero. Not agentic today.

| | |
| --- | --- |
| Steward | European Payments Initiative (EPI); iDEAL (Currence) (consortium) |
| Status | stabilising |
| Latest | [co-branding iDEAL \| Wero; stepwise technical migration pending DNB approval 2025-10-28](https://ideal.nl/en/ideal-vanaf-2026-stapsgewijs-over-naar-wero) |
| Radar | **adopt**: Fit decided it: the Dutch default method for Unfold's own billing and for Client shops, though not agentic today. |
| Moves when | EPI announces an end date for iDEAL, or a Human Not Present flow for Wero. |
| Competes with | [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Complements | [Mollie agentic commerce (ACP delegated payments, Mollie MCP server)](commerce.md#mollie-agentic), [EU PSD3 and Payment Services Regulation (PSR)](commerce.md#psd3-psr) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [2026-09-29-fair-credit-pricing](../../../../../docs/research/2026-09-29-fair-credit-pricing.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed iDEAL \| Wero for Credit bundles | Credits billing | Proposed: Agencies buy prepaid Credit bundles with iDEAL \| Wero through Mollie (ADR-0006), with invoices in euros (fair credit pricing record). | M | The payment method Dutch Agencies expect. |
| Edition fee by SEPA mandate | Credits billing | Proposed: take the monthly Edition fee by SEPA direct debit, with the first payment by iDEAL to set the mandate; check this still works after the Wero migration. | M | Recurring billing without cards. |
| Co-branding Work Item for Clients | Agency Work Item type | Proposed Work Item template: replace iDEAL logos and copy with the iDEAL \| Wero co-brand in a Client checkout. | S | A small, near-universal Work Item for Dutch webshops. |
| PSP migration check | Agency's Client webshop | Proposed reading Work Item: confirm a Client's PSP handles the stepwise Wero migration and what changes in its integration. | S | Prevents a broken checkout when the bank migrates. |
| Agent checkout fallback | Agency's Client webshop | Proposed: since iDEAL has no Human Not Present flow, agent checkouts hand the shopper a payment link. | S | Lets agent-built carts still be paid by iDEAL. |

**Shipped adoption:** Co-branded logo from early 2026. Migration is stepwise after De Nederlandsche Bank approval. Subscriptions are planned for the 'near future' (https://ideal.nl/en/ideal-vanaf-2026-stapsgewijs-over-naar-wero).; Rabobank: logo from 2026-01-29 and technical move of iDEAL Professional transactions from April 2026 (https://www.rabobank.nl/bedrijven/betalen/klanten-laten-betalen/ideal-professional/ideal-wero).; ABSENT: no agentic, mandate or delegated-credential capability for iDEAL or Wero in any protocol (UCP, ACP, AP2, MPP), PSP agentic product (Stripe, Mollie, Adyen) or EPI statement found.

**Open problems:** The iDEAL end date is not official. End-2027 is per banks and blogs [secondary] (https://www.vanlanschotkempen.com/nl-nl/private-banking/betalen/wero).; No Human Not Present flow, so agents cannot pay with it.

**Watched:** changelog-page `https://ideal.nl/en/ideal-vanaf-2026-stapsgewijs-over-naar-wero`

## Laravel agent-payment middleware (sandermuller/laravel-x402, square1/laravel-mpp) { #laravel-x402-mpp-packages }

Not to be confused with: Community Laravel middleware for x402 and MPP.

| | |
| --- | --- |
| Steward | Sander Muller; Square1 (community) |
| Status | draft |
| Latest | [laravel-mpp 2.4.0 / laravel-x402 0.8.0 2026-10-13](https://packagist.org/packages/square1/laravel-mpp) |
| Radar | **hold**: Maturity decided it: a few hundred downloads and a lagging stripe-php pin. |
| Moves when | laravel-mpp supports current stripe-php and MPP reaches an IETF working group. |
| Competes with | — |
| Complements | [x402 (HTTP 402 payments)](commerce.md#x402), [Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme](commerce.md#mpp), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Builds on | [x402 (HTTP 402 payments)](commerce.md#x402), [Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme](commerce.md#mpp) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No use in Unfold billing | Credits billing | Record that Unfold bills in euros through Mollie. | S | Clarity. |
| Paid API Work Item, later | Agency Work Item type | Proposed: use laravel-mpp for a Client API only after MPP matures. | M | A future Work Item for data-selling Clients. |
| Dependency conflict check | Agency's Client webshop | Proposed: check laravel-mpp's stripe-php below 21 pin against the Client's Stripe version. | S | Avoids a blocked upgrade. |
| x402 only for US Clients | Agency's Client webshop | Proposed: limit laravel-x402 to Clients with a US entity. | S | Matches the rails available. |
| Watch adoption | Agency Work Item type | Proposed: revisit when downloads grow. | S | Avoids a fragile dependency. |

**Shipped adoption:** laravel-mpp: 218 downloads; settles via Stripe SPT or Tempo; #[RequiresPayment] attribute; requires stripe/stripe-php <21 (https://packagist.org/packages/square1/laravel-mpp).; laravel-x402: 402 downloads (https://packagist.org/packages/sandermuller/laravel-x402).

**Open problems:** laravel-mpp's stripe-php pin (<21) lags the current v22 betas (https://packagist.org/packages/stripe/stripe-php).

**Watched:** github-releases `square1-io/laravel-mpp` at 2.4.0, github-releases `SanderMuller/laravel-x402` at 0.8.0

## laravel/mcp (Laravel MCP) { #laravel-mcp }

Not to be confused with: Laravel's first-party package for building MCP servers (web and local), with tools, prompts, resources, and OAuth 2.1 via Passport or Sanctum.

| | |
| --- | --- |
| Steward | Laravel (single-vendor) |
| Status | stable |
| Latest | [v1.1.2 2026-10-26](https://packagist.org/packages/laravel/mcp) |
| Radar | **trial**: Fit decided it: stable and first-party for the Laravel stack many Agencies use, but untested in Unfold Work Items. |
| Moves when | Five Client Work Items using laravel/mcp are accepted. |
| Competes with | [Official MCP PHP SDK (mcp/sdk)](commerce.md#php-mcp-sdk), [php-mcp/server (and php-mcp/laravel)](commerce.md#php-mcp-server) |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [WebMCP (Web Model Context API)](commerce.md#webmcp), [x402 (HTTP 402 payments)](commerce.md#x402), [Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme](commerce.md#mpp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [2026-09-30-mcp-server-patterns](../../../../../docs/research/2026-09-30-mcp-server-patterns.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| MCP server for a Laravel Client app | Agency Work Item type | Proposed Work Item template: add laravel/mcp tools to a Client's Laravel portal or shop, with OAuth through Passport or Sanctum. | M | The default route for Dutch Laravel Agencies to make Client apps agent-ready. |
| Read-first rule for Client tools | Agency Work Item type | Proposed: apply ADR-0011's read-first approach and ADR-0037's confirmation rule to Client MCP servers. | S | Carries Unfold's safety lessons to Client work. |
| Laravel Boost in Client repositories | Agency's Client webshop | Proposed: Runs use laravel/boost where present, noting it may overwrite agent instructions. | S | Better-informed Runs on Laravel repositories. |
| Not for Unfold's own servers | Unfold API | Record that Unfold and Ploeg serve MCP in TypeScript and Go (ADR-0011, ADR-0032). | S | Clarity. |
| Spec version check | Agency Work Item type | Proposed: confirm which MCP spec version laravel/mcp serves before promising Clients newer features. | S | Avoids overpromising. |

**Shipped adoption:** 51.9M total downloads, 10.1M per month (https://packagist.org/packages/laravel/mcp).; Required by laravel/boost v2.10.4, released 2026-10-29 (https://packagist.org/packages/laravel/boost).; The docs reference MCP spec 2025-06-18 features (output schemas, annotations, structured content) and OAuth via Mcp::oauthRoutes with an mcp:use scope (https://laravel.com/docs/12.x/mcp).

**Open problems:** Custom OAuth scopes are not supported (https://laravel.com/docs/12.x/mcp).; Support for the 2025-11-25 and 2026-07-28 MCP spec versions was not verified.

**Watched:** github-releases `laravel/mcp` at v1.1.2

## Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme { #mpp }

Not to be confused with: Tempo and Stripe protocol over HTTP 402 with WWW-Authenticate: Payment. Rail-agnostic (Tempo, Stripe SPT cards, Lightning, Solana, and others). Not x402.

| | |
| --- | --- |
| Steward | Tempo Labs and Stripe. IETF individual draft. (consortium) |
| Status | draft |
| Latest | [draft-httpauth-payment-01 2026-09-09](https://datatracker.ietf.org/doc/draft-httpauth-payment/) |
| Radar | **assess**: Maturity decided it: an individual draft with no PHP SDK, though its card rail fits euro businesses better than x402. |
| Moves when | An IETF working group adopts draft-httpauth-payment, or Stripe offers MPP to Dutch businesses. |
| Competes with | [x402 (HTTP 402 payments)](commerce.md#x402) |
| Complements | [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite), [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance](../../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed per-call charging for outside agents | Unfold API | Proposed: if Unfold's MCP servers (ADR-0011, ADR-0032) ever serve paying outside agents, MPP's Payment scheme on HTTP 402 is the card-capable option. | M | A route to charge agents without accounts, if ever needed. |
| Ask payments, later | Credits billing | Proposed: compare MPP sessions with the Ask Allowance of ADR-0031 for sub-cent charges; the allowance stays the default. | S | Tests whether micro-payments would beat an allowance. |
| Paid API endpoint for a Client | Agency Work Item type | Proposed: add square1/laravel-mpp to a Client's Laravel API, after checking the stripe-php pin. | M | A Work Item for Clients that sell data or services to agents. |
| Stripe machine payments review | Agency's Client webshop | Proposed reading Work Item: check which MPP rails work for a Dutch Client in Stripe. | S | Sets expectations before building. |
| Watch the IETF route | Agency Work Item type | Proposed: no template until a working group adopts the draft. | S | Avoids building on an individual draft. |

**Shipped adoption:** "Launched 2026-03-18 with Tempo mainnet [secondary] (https://www.theblock.co/post/394131/tempo-mainnet-goes-live-with-machine-payments-protocol-for-agents)."; "Stripe machine payments: cards via SPT (min 0.50 USD), stablecoins on Tempo and Solana. Sessions allow sub-cent charges (https://docs.stripe.com/payments/machine)."; "Official SDKs: TypeScript, Python, Rust, Go, Ruby. No official PHP SDK (https://mpp.dev)."; "PHP community: square1/laravel-mpp 2.4.0 (2026-10-13, 218 downloads, requires stripe/stripe-php <21) (https://packagist.org/packages/square1/laravel-mpp)."

**Open problems:** "Individual draft, not endorsed by the IETF, no WG (https://datatracker.ietf.org/doc/draft-httpauth-payment/)."

**Watched:** ietf-draft `draft-httpauth-payment` at 01

## Mastercard Agent Pay { #mastercard-agent-pay }

Not to be confused with: Mastercard's agentic tokenisation and registration programme. Verifiable Intent is a separate spec.

| | |
| --- | --- |
| Steward | Mastercard (single-vendor) |
| Status | stabilising |
| Latest | [EU network-level enablement 2026-06-02](https://newsroom.mastercard.com/news/europe/en/perspectives/en/2026/europe-is-building-the-foundations-for-trusted-agentic-commerce/) |
| Radar | **hold**: Fit decided it: issuer enablement is not cardholder availability, and merchants receive it only through their PSP. |
| Moves when | Mastercard announces general cardholder availability of Agent Pay in the Netherlands. |
| Competes with | — |
| Complements | [Verifiable Intent](commerce.md#verifiable-intent), [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens), [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No Unfold billing impact | Credits billing | Record that Agent Pay reaches merchants through the PSP. | S | Clarity that nothing is owed. |
| PSP readiness check | Agency Work Item type | Proposed reading Work Item: confirm a Client's PSP accepts Agent Pay tokens. | S | Clients learn whether they are ready. |
| Passkey SCA in a Client checkout | Agency's Client webshop | Proposed: support passkey-based SCA in a Client checkout that card agents rely on. | M | Fewer failed agent payments. |
| Agent order reporting | Agency's Client webshop | Proposed: report Agent Pay orders separately for the Client. | S | Measures a new channel. |
| Watch cardholder availability | Agency Work Item type | Proposed: no template until transactions leave controlled pilots. | S | Avoids premature work. |

**Shipped adoption:** All European issuers enabled. Controlled live transactions with passkeys; banks include bunq, N26, Deutsche Bank and KBC (https://newsroom.mastercard.com/news/europe/en/perspectives/en/2026/europe-is-building-the-foundations-for-trusted-agentic-commerce/).; Rabobank pilot paying Priceless.com, 2026-04-30 [secondary] (https://ppc.land/mastercard-and-rabobank-complete-first-ai-agent-payment-in-the-netherlands/).

**Open problems:** Issuer enablement is not cardholder availability. Transactions are 'controlled' (https://newsroom.mastercard.com/news/europe/en/perspectives/en/2026/europe-is-building-the-foundations-for-trusted-agentic-commerce/).

**Watched:** changelog-page `https://newsroom.mastercard.com/news/europe/en/`

## Mollie agentic commerce (ACP delegated payments, Mollie MCP server) { #mollie-agentic }

Not to be confused with: Mollie's ACP-compatible delegated payments API and its merchant-ops MCP server. Not a protocol.

| | |
| --- | --- |
| Steward | Mollie (single-vendor) |
| Status | draft |
| Latest | [ACP delegated payments API (announced) 2025-11-24](https://ffnews.com/newsarticle/paytech/mollie-ready-for-ai-payments-before-openai-launches-in-europe/) |
| Radar | **assess**: Fit decided it: Mollie is Unfold's chosen PSP, but its agentic API has no public docs and its MCP server is the only usable part. |
| Moves when | Mollie publishes developer documentation for agentic payments. |
| Competes with | [Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT)](commerce.md#stripe-agentic-commerce-suite), [Adyen Agentic](commerce.md#adyen-agentic) |
| Complements | [Agentic Commerce Protocol (ACP)](commerce.md#acp), [iDEAL \| Wero (EPI Wero migration)](commerce.md#ideal-wero) |
| Builds on | [Agentic Commerce Protocol (ACP)](commerce.md#acp) |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Mollie MCP server for billing operations | Credits billing | Proposed: once billing exists on Mollie (ADR-0006), let the owner query payments and refunds through Mollie's MCP server in an interactive session, read-only. | S | Faster support on Credit purchases and Reversals. |
| Credits purchases with mollie-api-php or the Node client | Credits billing | Proposed: Unfold's billing calls Mollie's API for Credit bundles and the Edition fee; Unfold is TypeScript, so the Node client applies. | M | Implements the decided billing stack. |
| mollie-api-php v4 upgrade for a Client | Agency Work Item type | Proposed Work Item template: upgrade a Client shop to mollie-api-php 4.0.0. | S | A routine Work Item many Dutch Agencies need. |
| Agent payments with Mollie, later | Agency's Client webshop | Proposed: connect a Client's checkout to Mollie's delegated payments once documented. | M | Would give Dutch Clients agent payments on their current PSP. |
| Ask Mollie for its roadmap | Credits billing | Proposed: the owner asks Mollie whether agentic payments and iDEAL in agent flows are planned. | S | Decides whether Mollie stays the right choice for agent work. |

**Shipped adoption:** ACP delegated payments API plus a hackathon demo paid with Apple Pay (https://ffnews.com/newsarticle/paytech/mollie-ready-for-ai-payments-before-openai-launches-in-europe/).; Mollie MCP server launched July 2025 (https://www.mollie.com/news/mollie-launches-ai-ready-mcp-server).; mollie-api-php v4.0.0 (2026-09-23) (https://packagist.org/packages/mollie/mollie-api-php).; ABSENT: no public Mollie developer documentation for agentic payments (docs.mollie.com/docs/agentic-commerce returns 404). No UCP or AP2 support found. No statement on iDEAL \| Wero in agent flows.

**Open problems:** Bet on ACP, whose flagship checkout retreated in March 2026 [secondary]. No 2026 product update found.

**Watched:** github-releases `mollie/mollie-api-php` at v4.1.0, changelog-page `https://www.mollie.com/news`

## Official MCP PHP SDK (mcp/sdk) { #php-mcp-sdk }

Not to be confused with: The modelcontextprotocol/php-sdk, a framework-agnostic PHP SDK (Symfony and PHP Foundation collaboration). Not php-mcp/server.

| | |
| --- | --- |
| Steward | Model Context Protocol project (foundation) |
| Status | stabilising |
| Latest | [v0.9.0 2026-10-18](https://packagist.org/packages/mcp/sdk) |
| Radar | **assess**: Maturity decided it: official and widely used but still 0.x. |
| Moves when | mcp/sdk releases 1.0. |
| Competes with | [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp), [php-mcp/server (and php-mcp/laravel)](commerce.md#php-mcp-server) |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-30-mcp-server-patterns](../../../../../docs/research/2026-09-30-mcp-server-patterns.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| MCP server for a Symfony Client | Agency Work Item type | Proposed Work Item template: add mcp/sdk to a Symfony or plain-PHP Client app. | M | Covers non-Laravel PHP Clients. |
| Magento extension route | Agency's Client webshop | Proposed: build Magento MCP tools on mcp/sdk. | L | Opens agent tools for Magento Clients. |
| Not for Unfold itself | Unfold API | Record that Unfold is TypeScript and Go. | S | Clarity. |
| Pin 0.x versions | Agency Work Item type | Proposed: Refinement pins mcp/sdk exactly while it is 0.x. | S | Prevents breakage. |
| Compare with laravel/mcp | Agency Work Item type | Proposed: use laravel/mcp on Laravel and mcp/sdk elsewhere. | S | One clear rule for Agencies. |

**Shipped adoption:** 6.07M total downloads, 1.7M per month (https://packagist.org/packages/mcp/sdk).

**Open problems:** Still 0.x (https://packagist.org/packages/mcp/sdk).

**Watched:** github-releases `modelcontextprotocol/php-sdk` at v0.9.0

## php-mcp/server (and php-mcp/laravel) { #php-mcp-server }

Not to be confused with: Community PHP MCP server library. php-mcp/laravel is its Laravel wrapper.

| | |
| --- | --- |
| Steward | php-mcp (community) (community) |
| Status | dormant |
| Latest | [3.3.0 (server); laravel 4.0.0 on 2026-03-29 2025-07-12](https://packagist.org/packages/php-mcp/server) |
| Radar | **hold**: Maturity decided it: no server release since 2025-07-12 and superseded by laravel/mcp. |
| Moves when | php-mcp/server ships a new release supporting the current MCP spec. |
| Competes with | [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp), [Official MCP PHP SDK (mcp/sdk)](commerce.md#php-mcp-sdk) |
| Complements | — |
| Builds on | — |
| Superseded by | [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Migrate Clients off php-mcp | Agency Work Item type | Proposed Work Item template: move a Client's php-mcp/laravel server to laravel/mcp. | M | Removes a dormant dependency. |
| Flag in dependency reviews | Agency's Client webshop | Proposed: Runs flag php-mcp/server as dormant when they see it. | S | Early warning for Clients. |
| Not for Unfold | Unfold API | Record no use. | S | Clarity. |
| No new adoption | Agency Work Item type | Proposed: Refinement never proposes it for new work. | S | Avoids new debt. |
| Security watch | Agency's Client webshop | Proposed: check Clients still on it for unpatched issues. | S | Reduces risk. |

**Shipped adoption:** 914k total downloads (https://packagist.org/packages/php-mcp/server). php-mcp/laravel 322k (https://packagist.org/packages/php-mcp/laravel).

**Open problems:** No server release since 2025-07-12 (https://packagist.org/packages/php-mcp/server).

**Watched:** github-releases `php-mcp/server` at 3.3.0

## Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy) { #schema-org-commerce }

Not to be confused with: JSON-LD structured data on pages. Distinct from Merchant Center feeds, though attributes align.

| | |
| --- | --- |
| Steward | Schema.org (W3C Community Group; Google, Microsoft, Yahoo, Yandex) (community) |
| Status | stable |
| Latest | [30.1 2026-09-16](https://schema.org/docs/releases.html) |
| Radar | **adopt**: Both decided it: a stable vocabulary that the site already uses and that every agent-ready webshop needs. |
| Moves when | Major agent platforms stop reading on-page JSON-LD in favour of feeds or UCP only. |
| Competes with | — |
| Complements | [Google UCP-powered checkout and Merchant Center agent attributes](commerce.md#google-merchant-ucp), [Universal Commerce Protocol (UCP)](commerce.md#ucp), [llms.txt](web-content.md#llms-txt), [NLWeb](web-content.md#nlweb) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [adr-0008-every-pull-request-gets-a-preview-environment](../../../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Offer markup on the planned pricing page | Unfold site | BaseHead.astro already writes JSON-LD; proposed: add Product and Offer for Editions and the Credit price once ADR-0006's public price list is published. | S | Agents quote Unfold's prices correctly, with the euro value of a Credit. |
| SoftwareApplication markup for Unfold | Unfold site | Extend the existing JSON-LD in apps/site/src/components/BaseHead.astro with SoftwareApplication and license data. | S | Describes Unfold as open source in a form search and agents read. |
| Product structured data Work Item | Agency Work Item type | Proposed Work Item template: add Product, Offer, OfferShippingDetails and MerchantReturnPolicy to a Client webshop, validated in the Preview Environment. | S | The most broadly useful agent-readiness change for a webshop. |
| EU Digital Product Passport fields | Agency's Client webshop | Proposed: use the 30.1 Digital Product Passport types for Clients that fall under EU product rules. | M | Prepares Clients for an EU obligation with a stable vocabulary. |
| Structured data check in CI | Preview Environment | Proposed: CI validates JSON-LD on changed templates and posts results to the pull request (ADR-0010). | S | Gives Acceptance executable Evidence. |

**Shipped adoption:** 30.1 added retail feed vocabulary (consumerNotice, isOftenBoughtWith, itemPopularity, minimumOrderValue on ShippingRateSettings, MaximumRetailPrice) and EU Digital Product Passport types (https://schema.org/docs/releases.html).; 29.0 (2025-03-24) added ShippingConditions and ShippingService (https://schema.org/docs/releases.html).

**Open problems:** No agent-specific terms in 2025-2026 releases. Feeds and UCP carry live price and stock instead (https://schema.org/docs/releases.html).

**Watched:** changelog-page `https://schema.org/docs/releases.html`

## Shopify agentic commerce (UCP endpoints, Global and Storefront Catalog, Cart, Checkout and Order MCP, Agentic Storefronts) { #shopify-agentic }

Not to be confused with: Shopify's implementation of UCP. Storefront MCP catalog and cart tools were removed in favour of /api/ucp/mcp.

| | |
| --- | --- |
| Steward | Shopify (single-vendor) |
| Status | stabilising |
| Latest | [UCP Cart MCP (dev.ucp.shopping.cart 2026-04-08); Storefront MCP cart tools removed after 2026-08-31 2026-08-31](https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp) |
| Radar | **assess**: Fit decided it: a working UCP implementation, but no EU or NL agent checkout yet. |
| Moves when | Shopify opens agent channel checkout to Dutch shoppers. |
| Competes with | — |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Builds on | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Superseded by | — |
| Decisions | [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| UCP profile for a Shopify Client | Agency Work Item type | Proposed Work Item template: set up a Client's UCP profile and catalog for agents, ready for when NL checkout opens. | S | Cheap preparation for Shopify Clients. |
| Migrate off removed Storefront MCP cart tools | Agency's Client webshop | Proposed: move any Client integration from the removed cart tools to /api/ucp/mcp. | S | Fixes a broken integration after 2026-08-31. |
| Agentic Storefronts for Clients selling to the US | Agency's Client webshop | Proposed: enable agent channels for Clients that ship to the US. | S | Opens a channel for exporting Clients. |
| No Shopify tie to Unfold billing | Credits billing | Record that Shopify is a Client platform, not Unfold's. | S | Clarity. |
| Shopify knowledge in the Client Profile | Client Portal | Proposed: a Client Profile instruction tells agents which Shopify agent APIs exist (ADR-0034 knowledge scopes). | S | Fewer wrong Runs on Shopify work. |

**Shipped adoption:** Offerings: Universal Cart (early access), Global Catalog, Storefront Catalog, Cart, Checkout and Order MCP, UCP profiles, UCP CLI (https://shopify.dev/docs/agents).; Storefront MCP catalog and cart tools removed, replaced by https://{shop}/api/ucp/mcp. The Customer Accounts MCP is unchanged (https://shopify.dev/docs/apps/build/storefront-mcp).; Channel checkout country rules (checked 2026-10-19): Google and Copilot direct checkout for US shoppers only; Meta for US/CA/MX; ChatGPT needs a store that sells to the US [secondary] (https://craftshift.com/shopify-ai-channels-outside-us/).

**Open problems:** No EU or NL direct checkout in agent channels [secondary] (https://craftshift.com/shopify-ai-channels-outside-us/).; Checkout MCP is limited to trusted agents (https://shopify.dev/docs/agents).

**Watched:** changelog-page `https://shopify.dev/changelog`

## Stripe Agentic Commerce Suite and Shared Payment Tokens (SPT) { #stripe-agentic-commerce-suite }

Not to be confused with: Stripe products. SPT is a scoped, revocable grant to use a buyer's payment method. The Suite is catalog-to-agent distribution plus Stripe-managed checkout.

| | |
| --- | --- |
| Steward | Stripe (single-vendor) |
| Status | stabilising |
| Latest | [API Stripe-Version 2026-09-30.preview 2026-09-30](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens) |
| Radar | **assess**: Fit decided it: SPT works in NL, but it is card-only, in preview, and Unfold's own billing uses Mollie. |
| Moves when | Stripe takes SPT out of preview or adds iDEAL \| Wero to it. |
| Competes with | [Mollie agentic commerce (ACP delegated payments, Mollie MCP server)](commerce.md#mollie-agentic), [Adyen Agentic](commerce.md#adyen-agentic) |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [Agentic Commerce Protocol (ACP)](commerce.md#acp), [Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme](commerce.md#mpp), [x402 (HTTP 402 payments)](commerce.md#x402), [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Builds on | [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Stays outside Unfold's billing | Credits billing | ADR-0006 picks Mollie for payment; record that Stripe agent products are for Client work, not Unfold's own billing. | S | Keeps one PSP in Unfold's stack. |
| Shared Payment Tokens for a Stripe Client | Agency's Client webshop | Proposed Work Item template: accept SPTs in a Dutch Stripe Client's checkout, available in NL under preview terms. | M | The most available agent payment route for NL Stripe shops today. |
| Catalog distribution to agents | Agency Work Item type | Proposed: publish a Client's catalog through the Suite in the European countries it covers. | M | Reaches agent channels without a custom feed. |
| White label Edition billing through Stripe | Credits billing | Research suggests White label Agencies bill their Clients through their own Stripe or Mollie (2026-09-29 pricing strategy); proposed: Unfold only exports lines (ADR-0050). | S | Lets Agencies keep their PSP. |
| stripe-php upgrade Work Item | Agency's Client webshop | Proposed: upgrade a Client to the stripe-php 22 beta only behind a feature flag. | S | Keeps preview APIs out of production by default. |

**Shipped adoption:** SPT supported countries include NL, BE, DE and most of the EEA, plus US, CA, GB, CH and NO. Preview terms apply. The Resolve API returns fpan, dpan or agentic_token, and Stripe may use Mastercard Agent Pay, Visa Intelligent Commerce or the Amex ACE Kit tokens (https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens).; Agentic Commerce Suite: Stripe-managed checkout in the US, Canada and select European countries. Can run your own UCP checkout with the Stripe Payments handler (https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail).; Link Agent Wallet and WebMCP guides (https://docs.stripe.com/agentic-commerce).; stripe-php v22.2.0-beta.1 (2026-10-29) (https://packagist.org/packages/stripe/stripe-php).

**Open problems:** Preview terms. Hooks for every checkout event are private preview, US only (https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail).; SPT credentials are card-based. ABSENT: no iDEAL or Wero via SPT documented.

**Watched:** changelog-page `https://docs.stripe.com/changelog`, github-releases `stripe/stripe-php` at v22.1.0

## UCP PHP SDK (ucp-php-sdk/core, symfony-bundle) and Laravel UCP packages { #ucp-php-sdk }

Not to be confused with: Community PHP implementations of the UCP merchant side. Not official UCP.

| | |
| --- | --- |
| Steward | agentic-commerce-alliance GitHub org (identity not stated); tcgunel (ucp-laravel) (community) |
| Status | draft |
| Latest | [core 0.0.7 (UCP 2026-08-25 schemas) 2026-09-15](https://packagist.org/packages/ucp-php-sdk/core) |
| Radar | **hold**: Maturity decided it: 0.0.x, unknown maintainer and download counts that may be inflated. |
| Moves when | UCP publishes an official PHP SDK or a known maintainer takes these over. |
| Competes with | — |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Builds on | [Universal Commerce Protocol (UCP)](commerce.md#ucp) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Avoid for Client UCP work | Agency Work Item type | Proposed: Refinement prefers generating code from UCP's published schemas over these packages. | S | Avoids an unknown maintainer. |
| Schema-generated UCP models | Agency's Client webshop | Proposed: generate PHP models from UCP JSON schemas inside the Client repository. | M | Control over a fast-breaking spec. |
| Not for Unfold | Unfold API | Record no use. | S | Clarity. |
| Review downloads before trust | Agency Work Item type | Proposed: a reading Work Item checks maintainer and download data before any adoption. | S | Supply-chain caution. |
| Revisit with an official SDK | Agency Work Item type | Proposed: switch if UCP publishes an official PHP SDK. | S | Keeps the door open. |

**Shipped adoption:** 21k downloads but 1 GitHub star. The download count may be inflated (https://github.com/agentic-commerce-alliance/ucp-php-sdk-core).; tcgunel/ucp-laravel v0.3.0 (2026-05-21), 0 downloads (https://packagist.org/packages/tcgunel/ucp-laravel).

**Open problems:** Unknown maintainer. Symfony-first with no Laravel adapter (https://github.com/agentic-commerce-alliance/ucp-php-sdk-core).

**Watched:** github-tags `agentic-commerce-alliance/ucp-php-sdk-core` at 0.0.7

## Universal Commerce Protocol (UCP) { #ucp }

Not to be confused with: An open spec by Google and Shopify for agent-to-merchant discovery, catalog, cart, checkout, identity linking and orders over REST/JSON-RPC, MCP, A2A or embedded. "Universal Cart" is a product on top of it, not a protocol.

| | |
| --- | --- |
| Steward | UCP Authors. Google and Shopify co-developed it with listed co-developers (https://ucp.dev). (consortium) |
| Status | stabilising |
| Latest | [v2026-08-25 2026-08-25](https://github.com/Universal-Commerce-Protocol/ucp/releases) |
| Radar | **assess**: Maturity decided it: frequent breaking releases, no neutral foundation and no NL checkout surface, though it fits Agency webshop work. |
| Moves when | A UCP checkout surface opens to Dutch shoppers, or UCP moves to a neutral foundation with a stable version. |
| Competes with | [Agentic Commerce Protocol (ACP)](commerce.md#acp) |
| Complements | [Agent Payments Protocol (AP2)](commerce.md#ap2), [Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy)](commerce.md#schema-org-commerce), [WebMCP (Web Model Context API)](commerce.md#webmcp), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Builds on | [Agent Payments Protocol (AP2)](commerce.md#ap2) |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| UCP catalog endpoint for a Client webshop | Agency Work Item type | Proposed Work Item template: expose discovery and catalog from a Client's shop over UCP, sized M, starting read-only. | M | Prepares Clients for agent shopping with the protocol most PSPs back. |
| Track UCP releases in Refinement | Agency Work Item type | Proposed: Refinement pins the UCP version in the Work Item, since releases often break the schema. | S | Keeps an accepted change from breaking at the next release. |
| UCP checkout with the Stripe payment handler | Agency's Client webshop | Proposed: for a Stripe Client, run the shop's own UCP checkout with the Stripe handler. | L | Lets agents complete orders through a PSP the Client already has. |
| No UCP for Unfold's own billing | Credits billing | Record that Credits are B2B purchases through Mollie (ADR-0006), outside UCP's retail scope. | S | Saves building a channel no buyer uses. |
| Proposed Preview check for UCP endpoints | Preview Environment | Proposed: CI calls the preview's UCP profile and catalog with a test agent and posts the result. | S | Gives the reviewer Evidence for an agent-facing change. |

**Shipped adoption:** Shopify: Cart MCP at https://{shop}/api/ucp/mcp replaced the Storefront MCP cart tools (supported until 2026-08-31) (https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp).; Google AI Mode and Gemini checkout (US, CA, AU) (https://support.google.com/merchants/answer/16837055?hl=en).; Stripe UCP payment handler and own-checkout guide (https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail).; Adyen Agentic supports UCP (https://www.adyen.com/press-and-media/adyen-agentic).; PHP: ucp-php-sdk/core 0.0.7 (UCP 2026-08-25 schemas) (https://packagist.org/packages/ucp-php-sdk/core). tcgunel/ucp-laravel v0.3.0 (https://packagist.org/packages/tcgunel/ucp-laravel). Several Magento modules (angeo/*).

**Open problems:** v2026-08-25 restructured the fulfillment schema, a breaking change. Releases ship frequently with breaking changes (https://github.com/Universal-Commerce-Protocol/ucp/releases).; No neutral foundation. GOVERNANCE.md not present; MAINTAINERS.md is held centrally (https://github.com/Universal-Commerce-Protocol/ucp).; Checkout surfaces (Google, Shopify channels) are not open to NL shoppers (https://craftshift.com/shopify-ai-channels-outside-us/) [secondary summary of Shopify help pages].

**Watched:** github-releases `Universal-Commerce-Protocol/ucp` at v2026-08-25

## Verifiable Intent { #verifiable-intent }

Not to be confused with: Mastercard and Google SD-JWT delegation chain binding issuer, user and agent to purchase intent. Contributed to FIDO with AP2.

| | |
| --- | --- |
| Steward | Verifiable Intent Contributors (Mastercard-led). Contributed to FIDO 2026-04-28. (foundation) |
| Status | draft |
| Latest | [Draft v0.1 2026-03-01](https://verifiableintent.dev) |
| Radar | **hold**: Maturity decided it: a v0.1 draft with no confirmed shipping integration. |
| Moves when | Mastercard confirms Verifiable Intent is live in Agent Pay in Europe. |
| Competes with | — |
| Complements | [Agent Payments Protocol (AP2)](commerce.md#ap2), [Mastercard Agent Pay](commerce.md#mastercard-agent-pay) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver](../../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Reference for delegated approval | Client Portal | Proposed: read the SD-JWT delegation chain as a model for a Client delegating Quote approval to an Approver (ADR-0049). | S | Informs the design without adopting the spec. |
| Card intent binding for a Client shop | Agency's Client webshop | Proposed: accept Verifiable Intent through the Client's PSP once Mastercard Agent Pay ships it. | M | Lowers fraud risk on agent card payments. |
| No direct integration for Unfold | Credits billing | Record that Credits are bought by people through Mollie, not by agents. | S | Saves effort. |
| Review of PSP support | Agency Work Item type | Proposed reading Work Item: check whether a Client's PSP passes intent data through. | S | Tells Clients when it becomes usable. |
| Watch for GA | Agency Work Item type | Proposed: no template until Mastercard announces general availability. | S | Avoids early work. |

**Shipped adoption:** Apache-2.0 spec plus reference implementation, with integration mappings for AP2, ACP and UCP (https://verifiableintent.dev).; Mastercard says it is 'gaining momentum' but gives no GA (https://newsroom.mastercard.com/news/europe/en/perspectives/en/2026/europe-is-building-the-foundations-for-trusted-agentic-commerce/).

**Open problems:** Integration into Agent Pay was 'expected in coming months' in March. Not confirmed shipped [secondary]. The site gives no exact date; latest.date is month-level, from March 2026 reporting (https://verifiableintent.dev).

**Watched:** github-tags `agent-intent/verifiable-intent` at v0.1.0

## Visa Trusted Agent Protocol (TAP) { #visa-tap }

Not to be confused with: RFC 9421-signed agent requests so merchants and CDNs can verify agent identity and consent. Distinct from Visa Intelligent Commerce tokens.

| | |
| --- | --- |
| Steward | Visa (single-vendor) |
| Status | draft |
| Latest | [no versioned release; 6 commits 2025-10-14](https://github.com/visa/trusted-agent-protocol) |
| Radar | **hold**: Maturity decided it: six commits and no release. |
| Moves when | Visa publishes a versioned TAP release and a CDN supports it by default. |
| Competes with | — |
| Complements | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth), [Card-network agentic tokens (Visa Intelligent Commerce, Mastercard Agent Pay tokens, Amex ACE Kit)](commerce.md#card-network-agentic-tokens) |
| Builds on | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Covered by Web Bot Auth | Ploeg Runs | Record that Unfold would follow Web Bot Auth, which TAP builds on. | S | One signing approach, not two. |
| CDN verification for a Client | Agency's Client webshop | Proposed: verify TAP-signed agents at the Client's CDN using Visa's reference proxy. | M | Lets Clients trust Visa-backed agents. |
| Review for card-heavy Clients | Agency Work Item type | Proposed reading Work Item: decide if TAP matters for a Client with many card payments. | S | Targets the few Clients it helps. |
| No Unfold billing impact | Credits billing | Record that TAP does not touch Credits. | S | Clarity. |
| Watch releases | Agency Work Item type | Proposed: no template until the repository has a release. | S | Avoids building on six commits. |

**Shipped adoption:** Announced 2025-10-14 (https://www.businesswire.com/news/home/20251014974512/en/Visa-Introduces-Trusted-Agent-Protocol-An-Ecosystem-Led-Framework-for-AI-Commerce).; Reference agent and CDN proxy with RFC 9421 verification (https://github.com/visa/trusted-agent-protocol).

**Open problems:** Repo has only 6 commits and no releases (https://github.com/visa/trusted-agent-protocol).

**Watched:** rss `https://github.com/visa/trusted-agent-protocol/commits/HEAD.atom`

## WebMCP (Web Model Context API) { #webmcp }

Not to be confused with: A browser API (`document.modelContext.registerTool`) that lets pages expose tools to in-browser agents. Not server-side MCP.

| | |
| --- | --- |
| Steward | W3C Web Machine Learning Community Group (editors from Microsoft and Google) (community) |
| Status | draft |
| Latest | [Draft Community Group Report 2026-11-02](https://webmachinelearning.github.io/webmcp/) |
| Radar | **assess**: Maturity decided it: a Community Group draft in a Chrome origin trial whose API name already changed once, although it fits both the portal and Agency work. |
| Moves when | WebMCP ships in stable Chrome without an origin-trial token, or moves to a W3C Working Group. |
| Competes with | [NLWeb](web-content.md#nlweb) |
| Complements | [Universal Commerce Protocol (UCP)](commerce.md#ucp), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp), [llms.txt](web-content.md#llms-txt) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0007-clients-approve-ready-work](../../../../../docs/adr/adr-0007-clients-approve-ready-work.md), [adr-0008-every-pull-request-gets-a-preview-environment](../../../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed WebMCP tools on the Client Portal | Client Portal | Proposed: register read-only tools such as list my Requests and show this Quote with document.modelContext.registerTool, so a Client's browser agent reads the portal without scraping. Approving a Quote stays a human click, marked with consequentialHint if it is ever exposed. | M | Lets a Client's own browser agent follow its Work Items while ADR-0007 keeps approval human. |
| Proposed sign-up tool on the Unfold site | Unfold site | Proposed: expose the existing POST /api/signup form (apps/site/src/worker/signup.ts) as a WebMCP tool with a JSON schema, behind progressive enhancement so the page still works without JavaScript. | S | A cheap, visible test of the API on a page Unfold controls end to end. |
| Make this webshop agent-ready: WebMCP layer | Agency Work Item type | Proposed Work Item template: register search, add-to-cart and checkout-handoff tools on an Agency's Client webshop, with the payment step marked consequential and left to the shopper. Refinement sizes it from the shop's existing frontend. | M | Gives Agencies a sellable, fixed-price Work Item on a standard browser vendors are trialling. |
| WebMCP check in the Preview Environment | Preview Environment | Proposed: a CI step in the Agency's pipeline lists the tools a preview registers and posts them to the pull request, so the reviewer sees what an agent can call before Acceptance (ADR-0008, ADR-0010). | S | Turns an invisible agent surface into Evidence the reviewer can check. |
| Stripe WebMCP payment handoff for a Client webshop | Agency's Client webshop | Proposed: follow Stripe's WebMCP guide to let an in-browser agent hand the shopper to Stripe checkout on a Client shop that already uses Stripe. | M | Reuses a documented PSP path instead of a custom agent checkout. |

**Shipped adoption:** Stripe guide 'Use WebMCP to complete Stripe payments in a browser' (https://docs.stripe.com/agentic-commerce/agents/webmcp).; Chrome origin trial from Chrome 149 (announced 2026-05-19) [secondary] (https://mcpplaygroundonline.com/blog/what-is-webmcp).; The spec has a consequentialHint annotation for money-moving tools (https://webmachinelearning.github.io/webmcp/).

**Open problems:** Not on the W3C standards track. Security and privacy section incomplete [secondary]. Rename from navigator.modelContext to document.modelContext broke early code (https://mcpplaygroundonline.com/blog/what-is-webmcp).

**Watched:** changelog-page `https://webmachinelearning.github.io/webmcp/`

## x402 (HTTP 402 payments) { #x402 }

Not to be confused with: Coinbase-originated, now foundation-governed protocol for pay-per-request over HTTP 402, mainly USDC stablecoins. Not MPP.

| | |
| --- | --- |
| Steward | x402 Foundation (Linux Foundation) (foundation) |
| Status | stabilising |
| Latest | [Protocol V2 (x402-specification-v2.md); SDK tags v2.29.0 2026-10-28](https://github.com/x402-foundation/x402/tags) |
| Radar | **hold**: Fit decided it: USDC on US-only offers with no fiat or EU path, for Agencies that sell in euros. |
| Moves when | Stripe or Cloudflare offers x402 to EU businesses with euro settlement. |
| Competes with | [Machine Payments Protocol (MPP) / "Payment" HTTP authentication scheme](commerce.md#mpp) |
| Complements | [Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use)](web-content.md#cloudflare-ai-crawl-control), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0006-the-ticket-is-the-billing-unit](../../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No x402 for Unfold's Token Charge | Credits billing | Record that Token Charges and Delivery Fees are invoiced in euros (ADR-0006); stablecoin settlement is out. | S | Keeps billing in euros with clear VAT. |
| Paid public API calls, later | Unfold API | Proposed: if Unfold ever sells per-call API access to outside agents, compare x402 with MPP first. | M | Keeps the option without building now. |
| Pay-per-request API for a Client | Agency Work Item type | Proposed: for a Client selling data to agents, add laravel-x402 middleware; only for Clients with a US entity. | M | A niche Work Item for API-selling Clients. |
| Cloudflare Monetization Gateway | Agency's Client site | Proposed: for a US Client on Cloudflare, configure the gateway instead of code. | S | No code in the Client's app. |
| Risk review | Agency Work Item type | Proposed reading Work Item: explain the crypto, tax and fraud exposure to a Client before any x402 work. | S | Protects Clients from a poor fit. |

**Shipped adoption:** Foundation launched 2026-04-02 with 40 members. Premier members: AWS, Amex, Cloudflare, Coinbase, Google, Mastercard, Shopify, Solana Foundation, Stripe, Visa (https://docs.cdp.coinbase.com/x402/support/x402-foundation).; Cloudflare Monetization Gateway closed beta: Base USDC via Coinbase facilitator, US-only sellers and buyers (https://blog.cloudflare.com/monetization-gateway-beta/, 2026-09-30).; Stripe accepts x402 on Base USDC, for US businesses except NY (https://docs.stripe.com/payments/machine).; PHP: sandermuller/php-x402 0.8.0 (2026-05-10), sandermuller/laravel-x402 0.8.0 (2026-09-19, 402 downloads) (https://packagist.org/packages/sandermuller/laravel-x402).

**Open problems:** CoinDesk analysis (Mar 2026) estimated about half of transactions artificial [secondary] (https://toomanysecrets.com/the-protocols-powering-agentic-commerce-a-september-2026-update/).; No GitHub releases, only package tags (https://github.com/x402-foundation/x402/releases).; No fiat or EU path in the Cloudflare or Stripe offers above.

**Watched:** github-tags `x402-foundation/x402` at v1
