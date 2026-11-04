# Agents and the web: access, preferences, licensing

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use) { #cloudflare-ai-crawl-control }

Not to be confused with: Vendor product, not an open standard. Pay Per Crawl charges per crawl request with HTTP 402 and is being reshaped into Pay Per Use, which charges per reported use of the content. The x402 Monetization Gateway is a separate product.

| | |
| --- | --- |
| Steward | Cloudflare (single-vendor) |
| Status | stabilising |
| Latest | [Pay Per Crawl advanced configuration; Pay Per Use beta 2026-09-30](https://blog.cloudflare.com/pay-per-use/) |
| Radar | **assess**: Fit decided it: the site already uses Cloudflare, but Pay Per Crawl is a private beta with no stated EU terms, so only the free settings matter now. |
| Moves when | Pay Per Crawl or Pay Per Use opens to EU sellers with published rates. |
| Competes with | [Really Simple Licensing (RSL) 1.0](web-content.md#rsl), [IAB Tech Lab Content Monetization Protocols (CoMP), formerly the LLM Content Ingest API](web-content.md#iab-comp) |
| Complements | [Content Signals Policy (robots.txt Content-Signal)](web-content.md#content-signals), [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth), [x402 (HTTP 402 payments)](commerce.md#x402) |
| Builds on | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Superseded by | — |
| Decisions | [adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu](../../../../../docs/adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md), [adr-0012-the-marketing-site-releases-and-deploys-on-its-own](../../../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Check the AI crawler defaults on unfoldhq.dev | Unfold site | The site runs on Cloudflare Workers (apps/site/wrangler.toml); confirm in the dashboard that Training, Agent and Search crawlers are allowed, since the site wants to be found. | S | Prevents a vendor default from hiding Unfold from AI assistants. |
| Read AI crawler traffic for the site | Unfold site | Use AI Crawl Control's analytics to see which agents read the site, without adding analytics to the pages (apps/site/docs/architecture.md forbids third-party scripts). | S | Shows whether AI assistants are a real channel to Agencies. |
| Crawler policy Work Item for a Cloudflare Client | Agency Work Item type | Proposed Work Item template: set the Client's crawler policy, managed robots.txt and verified-bot rules, recorded as code where Cloudflare allows it. | S | A short, repeatable Work Item for every Client on Cloudflare. |
| Pay Per Crawl setup for a publisher Client | Agency's Client site | Proposed: join the private beta, set prices with the cf-pay-per-crawl header and exempt URIs, then report earnings to the Client. | M | Lets a publisher Client earn from AI crawling, if its beta access is granted. |
| SEO risk review of the new defaults | Agency's Client site | Proposed: a reading Work Item that checks whether blocking Training also blocks Googlebot on a Client's ad pages, and proposes a fix. | S | Catches a silent search-traffic loss for Clients with ads. |

**Shipped adoption:** AI Crawl Control (formerly AI Audit, 2024-09-23). Pay Per Crawl private beta since 2025-07-01. Discovery API added 2025-12-10. Advanced configuration with dynamic pricing via the cf-pay-per-crawl header and URI exemptions added 2026-06-16 (https://developers.cloudflare.com/ai-crawl-control/changelog/).; Pay Per Use beta: buyers self-report uses and publishers are paid monthly (https://blog.cloudflare.com/pay-per-use/, 2026-09-30). Early partners Ceramic.ai and You.com announced 2026-07-01 (https://blog.cloudflare.com/making-ai-search-smarter/).; New defaults from 2026-09-15 for new domains: Training and Agent crawlers blocked on ad-supported pages, Search allowed. Mixed-use crawlers such as Googlebot are blocked if Training is blocked (https://blog.cloudflare.com/content-independence-day-ai-options).; Stack Overflow adoption (Feb 2026) and GoDaddy partnership (2026-04-07) [secondary] (https://beancount.io/blog/2026/08/05/cloudflare-pay-per-crawl-ai-bot-content-monetization-guide).

**Open problems:** Pay Per Crawl is still a private beta. Pay Per Use has no published price or payout rates, and no regions or EU availability are stated (https://blog.cloudflare.com/pay-per-use/).; Googlebot is blocked on ad pages for sites that block Training: an SEO risk (https://blog.cloudflare.com/content-independence-day-ai-options).

**Watched:** changelog-page `https://developers.cloudflare.com/ai-crawl-control/changelog/`, changelog-page `https://blog.cloudflare.com/tag/ai-bots/`

## Content Signals Policy (robots.txt Content-Signal) { #content-signals }

Not to be confused with: A Cloudflare-originated robots.txt extension (search, ai-input, ai-train; `use=` field being tested). Not IETF AIPREF, though overlapping.

| | |
| --- | --- |
| Steward | Cloudflare (single-vendor) |
| Status | stabilising |
| Latest | [Content-Signal with experimental use=immediate\|reference\|full 2026-07-01](https://blog.cloudflare.com/content-independence-day-ai-options) |
| Radar | **adopt**: Fit decided it: one line in a file Unfold already generates, though it only expresses a preference and differs from IETF AIPREF. |
| Moves when | AIPREF publishes an RFC that replaces the Content-Signal vocabulary, or Cloudflare drops the format. |
| Competes with | [IETF AI Preferences (AIPREF) vocabulary and attachment](web-content.md#aipref) |
| Complements | [Really Simple Licensing (RSL) 1.0](web-content.md#rsl), [TDM Reservation Protocol (TDMRep)](web-content.md#tdmrep), [Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use)](web-content.md#cloudflare-ai-crawl-control) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0012-the-marketing-site-releases-and-deploys-on-its-own](../../../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Add a Content-Signal line to the site's robots.txt | Unfold site | Extend apps/site/src/pages/robots.txt.ts to write Content-Signal with search and ai-input set to yes and ai-train set by the owner, only when SITE_INDEXABLE is true. | S | States Unfold's preference in one line, with a test in apps/site/src/config/site.test.ts. |
| Same statement for the docs site | Unfold docs | Proposed: the published TechDocs site writes the same robots.txt signals, so docs and marketing agree. | S | One consistent stance across every Unfold host. |
| Content-signal Work Item for Clients | Agency Work Item type | Proposed Work Item template: add Content-Signal lines that match the Client's choice in its Client Profile, with AIPREF and TDMRep beside them where needed. | S | A cheap Work Item that records a Client's AI stance in a standard place. |
| Signals for a WooCommerce or Magento shop | Agency's Client webshop | Proposed: allow search and ai-input but not ai-train for product pages, so assistants can quote prices and stock. | S | Keeps shops visible to shopping agents while saying no to training. |
| Signals check in the Preview Environment | Preview Environment | Proposed: CI reads robots.txt from the preview and posts the parsed signals to the pull request (ADR-0010). | S | The reviewer sees the effective stance before Acceptance. |

**Shipped adoption:** Cloudflare-managed robots.txt adds `Content-Signal: search=yes,ai-train=no,use=reference` (https://blog.cloudflare.com/content-independence-day-ai-options).; Robots.txt tab checks Content Signals directives (2025-10-21) (https://developers.cloudflare.com/ai-crawl-control/changelog/).

**Open problems:** Expresses a preference only and does not block (https://blog.cloudflare.com/content-independence-day-ai-options).; The vocabulary diverges from the IETF AIPREF vocab (https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/).

**Watched:** changelog-page `https://developers.cloudflare.com/ai-crawl-control/changelog/`

## IAB Tech Lab Content Monetization Protocols (CoMP), formerly the LLM Content Ingest API { #iab-comp }

Not to be confused with: An API framework for licensed AI-bot-to-publisher access (access request, token, LLM Ingest API with natural-language queries). It is not RSL, and "CoMP" is not a compression format.

| | |
| --- | --- |
| Steward | IAB Tech Lab CoMP Working Group (consortium) |
| Status | stable |
| Latest | [v1 (CoMP-1.0.md) 2026-04-28](https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/) |
| Radar | **hold**: Maturity decided it: a final spec with no implementers and no AI-side adopters, and no fit with Unfold's own content. |
| Moves when | A named AI company or CDN announces it implements CoMP. |
| Competes with | [Really Simple Licensing (RSL) 1.0](web-content.md#rsl), [Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use)](web-content.md#cloudflare-ai-crawl-control) |
| Complements | [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth), [IETF AI Preferences (AIPREF) vocabulary and attachment](web-content.md#aipref) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No CoMP endpoint for Unfold's own content | Unfold site | Record that Unfold does not license its content through CoMP; its docs are open source. | S | Saves building an ingest API nobody calls. |
| CoMP readiness review for a publisher Client | Agency Work Item type | Proposed reading Work Item: compare CoMP, RSL and Cloudflare for a publisher Client and recommend one. | S | Agencies can advise publishers without building first. |
| LLM Ingest API prototype | Agency's Client site | Proposed: implement the CoMP access-request and token flow in front of a Client's article API, if a buyer appears. | L | Only worth it once a buyer exists. |
| Bot management guidance in the Client Profile | Client Portal | Proposed: link IAB's bot management guidance from the Client Profile of publisher Clients so Refinement uses it. | S | Gives agents a reference for crawler-related Work Items. |
| CDN blocking as a precondition | Agency's Client site | Proposed: a Work Item to set CDN bot blocking, which CoMP assumes, as a step before any licensing deal. | S | Reuses work that serves other licensing routes too. |

**Shipped adoption:** Public comment opened 2026-03-10 (https://iabtechlab.com/press-releases/iab-tech-lab-announces-comp-framework-to-ensure-llms-have-commercial-agreements-with-publishers-before-content-crawling/). Finalised 2026-04-28 (https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/).; The GitHub repo has CoMP-1.0.md plus Bot and Crawler Management Guidance, no tags and 6 stars (https://github.com/IABTechLab/CoMP).; ABSENT: no implementers listed. AI companies were invited, but none confirmed as participants (https://ppc.land/iab-tech-labs-comp-spec-forces-llms-to-pay-before-they-crawl/).

**Open problems:** Assumes blocking is done at the CDN. No AI-side adopters (https://ppc.land/iab-tech-labs-comp-spec-forces-llms-to-pay-before-they-crawl/).; Companion AI Bot Management Guidance was in public comment until 2026-06-25 (https://ppc.land/iab-tech-lab-opens-bot-management-guidance-for-public-comment/).

**Watched:** changelog-page `https://github.com/IABTechLab/CoMP`, changelog-page `https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/`

## IETF AI Preferences (AIPREF) vocabulary and attachment { #aipref }

Not to be confused with: An IETF WG vocabulary (train-ai, search, etc.) and its attachment via robots.txt and HTTP Content-Usage. It expresses preferences, not licences.

| | |
| --- | --- |
| Steward | IETF AIPREF WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-aipref-vocab-08 / draft-ietf-aipref-attach-05 2026-09-13](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/) |
| Radar | **assess**: Maturity decided it: drafts without working-group consensus and a missed milestone. |
| Moves when | draft-ietf-aipref-vocab is submitted to the IESG. |
| Competes with | [Content Signals Policy (robots.txt Content-Signal)](web-content.md#content-signals) |
| Complements | [Really Simple Licensing (RSL) 1.0](web-content.md#rsl), [TDM Reservation Protocol (TDMRep)](web-content.md#tdmrep) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed Content-Usage header on the site | Unfold site | Proposed: once the vocabulary is stable, add Content-Usage to public/_headers and robots.txt.ts next to Content-Signal. | S | Moves Unfold to the IETF vocabulary when it settles. |
| Map Content-Signal to AIPREF in one place | Unfold site | Proposed: generate both lines from one setting in apps/site/src/config/site.ts so they cannot disagree. | S | One source for Unfold's stance. |
| AIPREF in the Client Profile | Client Portal | Proposed: the Client Profile stores a Client's AI preferences in AIPREF terms, which Refinement turns into robots.txt and headers. | S | A neutral vocabulary for Client choices instead of a vendor's. |
| Preference-signal Work Item | Agency Work Item type | Proposed Work Item template: add AIPREF attachment through robots.txt and HTTP headers to a Client site. | S | A small Work Item that follows the IETF track. |
| Respect AIPREF in Ploeg's research Runs | Ploeg Runs | Proposed: Runs that fetch web pages read Content-Usage and skip pages that refuse AI input; needs a Ploeg contract. | M | Unfold's agents follow the preferences they help Clients publish. |

**Shipped adoption:** Related individual drafts: draft-wallace-aipref-grant-binding-03 (2026-10-27), draft-kelley-aipref-training-preference-signal-00 (2026-10-30) (https://datatracker.ietf.org/wg/aipref/documents/).; ABSENT: no IESG submission. The Aug 2026 milestone was missed, and the Note to Readers says the draft does not yet reflect WG consensus (https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/).

**Open problems:** No WG consensus yet; milestone slipped (https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/).

**Watched:** ietf-draft `draft-ietf-aipref-vocab` at 08, ietf-draft `draft-ietf-aipref-attach` at 05

## llms.txt { #llms-txt }

Not to be confused with: A Markdown index file at site root or subpath for LLM agents. v2 adds rel=describedby and rel=alternate text/markdown. Not robots.txt and not a licence.

| | |
| --- | --- |
| Steward | Answer.AI (Jeremy Howard), llmstxt.org (community) |
| Status | stabilising |
| Latest | [v2 2026-08-01](https://llmstxt.org/changes) |
| Radar | **adopt**: Fit decided it: Unfold already ships a root llms.txt, v2 is a small stable step, and it is a cheap Agency deliverable even though Google does not rank on it. |
| Moves when | Major agent vendors state they ignore llms.txt, or a W3C or IETF format replaces it. |
| Competes with | [NLWeb](web-content.md#nlweb) |
| Complements | [WebMCP (Web Model Context API)](commerce.md#webmcp), [Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy)](commerce.md#schema-org-commerce), [laravel/mcp (Laravel MCP)](commerce.md#laravel-mcp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0012-the-marketing-site-releases-and-deploys-on-its-own](../../../../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Move the repository llms.txt to v2 | Unfold docs | The root llms.txt already indexes the docs; add rel=describedby Link headers or link elements and Markdown alternates for docs pages, per v2. | S | Agents reading Unfold's docs find the index from any page, at almost no cost. |
| Proposed llms.txt for the Unfold site | Unfold site | Proposed: generate /llms.txt and per-page Markdown from the typed dictionaries in apps/site/src/i18n at build time, with an /nl subpath file for the Dutch locale. | S | An Agency asking an assistant about Unfold gets the site's own words, including the planned pricing. |
| Proposed llms.txt for Unfold's HTTP API | Unfold API | Proposed: once the OpenAPI description required by ADR-0050 exists, publish a subpath llms.txt that links it and the MCP servers of ADR-0011 and ADR-0032. | S | Agents building integrations find the contract without a support ticket. |
| Make this webshop agent-ready: llms.txt | Agency Work Item type | Proposed S-sized Work Item template: generate llms.txt and Markdown alternates for an Agency's Client site from its CMS or product catalogue, checked in the Preview Environment. | S | A small, low-risk first Work Item that Agencies can sell to many Clients. |
| llms.txt for a Stripe Directory listing | Agency's Client webshop | Proposed: when a Client lists in the Stripe Directory, which asks for the seller's llms.txt, the Work Item includes writing it. | S | Meets a concrete requirement of an agent sales channel. |

**Shipped adoption:** The Stripe Directory submission asks for a link to the seller's llms.txt (https://docs.stripe.com/payments/machine).; Magento module angeo/module-llms-txt (8,266 downloads) (https://packagist.org/packages/angeo/module-llms-txt).

**Open problems:** Google says it is not a Search ranking signal [secondary] (https://www.techwyse.com/news/search-seo/llms-txt-v2-markdown-links-ai-agents). v2 has only a month-level date ('August 2026'), so the day in latest.date is a placeholder (https://llmstxt.org/changes).

**Watched:** changelog-page `https://llmstxt.org/changes`

## NLWeb { #nlweb }

Not to be confused with: Microsoft-originated conversational interface for websites (/ask endpoint, each instance also an MCP server), using Schema.org data.

| | |
| --- | --- |
| Steward | Microsoft (repo nlweb-ai/NLWeb) (single-vendor) |
| Status | dormant |
| Latest | [no releases; last commits 2026-06-10 2026-06-10](https://github.com/nlweb-ai/NLWeb/commits/main) |
| Radar | **hold**: Maturity decided it: no releases and about five months without commits. |
| Moves when | NLWeb publishes a tagged release or resumes commits. |
| Competes with | [llms.txt](web-content.md#llms-txt), [WebMCP (Web Model Context API)](commerce.md#webmcp) |
| Complements | [Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy)](commerce.md#schema-org-commerce) |
| Builds on | [Schema.org commerce vocabulary (Product/Offer/OfferShippingDetails/MerchantReturnPolicy)](commerce.md#schema-org-commerce) |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No /ask endpoint on the Unfold site | Unfold site | Record that the site stays static (apps/site/docs/architecture.md); llms.txt covers the need. | S | Saves a dependency on a dormant project. |
| Conversational search for a content Client | Agency Work Item type | Proposed: only on request, build an /ask endpoint over a Client's Schema.org data, preferring the Client's own stack. | L | Low; the project has no releases. |
| Schema.org first, NLWeb later | Agency's Client webshop | Proposed: deliver Schema.org markup now, which NLWeb would read if it revives. | S | Keeps the option open at no extra cost. |
| Replace with an MCP server | Agency's Client site | Proposed: where a Client wants an agent endpoint, build an MCP server with laravel/mcp instead. | M | Uses a maintained route with the same effect. |
| Watch for revival | Agency Work Item type | Proposed: no Work Item template until the repository ships a release. | S | Avoids selling Clients a dead end. |

**Shipped adoption:** 6.3k stars and 1,184 commits. README: CI/CD not yet included, A2A 'soon' (https://github.com/nlweb-ai/NLWeb).

**Open problems:** No releases and nearly five months without commits (https://github.com/nlweb-ai/NLWeb/commits/main).

**Watched:** changelog-page `https://github.com/nlweb-ai/NLWeb/commits/main`

## Really Simple Licensing (RSL) 1.0 { #rsl }

Not to be confused with: XML licensing vocabulary for web content, discovered via robots.txt, HTTP Link header, HTML link or RSS. It is not the RSL Collective (the rights organisation) and not RSS.

| | |
| --- | --- |
| Steward | RSL Technical Steering Committee. The spec copyright reads "Internet Licensing Collective" (https://rslstandard.org/rsl/errata). The site header uses "RSL Collective" and the footer "RSL Internet Collective" (https://rslcollective.org/). No rename announcement found. (community) |
| Status | stable |
| Latest | [1.0 (last erratum 2026-08-07) 2026-08-07](https://rslstandard.org/rsl/errata) |
| Radar | **hold**: Fit decided it: Unfold wants its content read, and no AI company has committed to honour RSL, so it adds little now despite a stable 1.0. |
| Moves when | A major AI company publicly commits to honour RSL, or the EU opt-out list names it. |
| Competes with | [IAB Tech Lab Content Monetization Protocols (CoMP), formerly the LLM Content Ingest API](web-content.md#iab-comp), [Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use)](web-content.md#cloudflare-ai-crawl-control) |
| Complements | [IETF AI Preferences (AIPREF) vocabulary and attachment](web-content.md#aipref), [Content Signals Policy (robots.txt Content-Signal)](web-content.md#content-signals), [TDM Reservation Protocol (TDMRep)](web-content.md#tdmrep), [Web Bot Auth (HTTP Message Signatures for automated traffic)](web-content.md#web-bot-auth) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0014-the-unfold-name-and-mark-are-trademarks-not-cc-licensed-artwork](../../../../../docs/adr/adr-0014-the-unfold-name-and-mark-are-trademarks-not-cc-licensed-artwork.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed licence file for Unfold's docs | Unfold docs | Proposed: publish an RSL file that states the docs are free to use for AI input and training, matching the open-source licence in LICENSES. | S | States openly, in a machine-readable form, what Unfold wants: to be read. |
| Licence statement for the Unfold site | Unfold site | Proposed: link an RSL licence from robots.txt (apps/site/src/pages/robots.txt.ts) that allows use while keeping the name and mark under TRADEMARK.md. | S | Keeps the trademark position of ADR-0014 visible to crawlers. |
| Publisher Client licensing Work Item | Agency Work Item type | Proposed Work Item template for media or knowledge Clients: add /license.xml, robots.txt and Link headers with RSL terms chosen by the Client. | S | A small paid Work Item for Agencies with publishing Clients. |
| RSL with a CDN integration | Agency's Client site | Proposed: wire a CDN integration such as Supertab on Fastly that serves /license.xml and checks crawler requests, configured in the Client's own infrastructure. | M | Gives the licence some enforcement, which the standard lacks. |
| Content-licensing check in Refinement | Client Portal | Proposed: the Client Profile records the Client's chosen licensing stance, so Refinement adds the files to every relevant site Work Item. | S | Keeps a Client's choice consistent across its sites. |

**Shipped adoption:** 1.0 spec announced 2025-12-10 (https://rslstandard.org/press). Featured supporters: Akamai, Cloudflare, Creative Commons, Fastly, Reddit, Yahoo, Ziff Davis, O'Reilly, Vox Media and others (https://rslstandard.org/).; Supertab: working Fastly integration that serves /license.xml and checks crawler requests (https://connect-docs.supertab.co/reference/fastly/connect-on-fastly).; CEDRO (Spain) is the exclusive RSL Collective partner in Spain (https://ifrro.org/page/article-detail/cedro-partners-with-rsl-collective-to-develop-ai-content-licensing-framework/).; ABSENT: no AI company has publicly committed to honour RSL (https://digiday.com/media/arena-group-buzzfeed-usa-today-co-vox-media-join-rsls-ai-content-licensing-efforts/, 2025-11-26). No 2026 contradiction found.; ABSENT: the Collective's licence agreement was promised for end-2025. Not found published.

**Open problems:** No enforcement in the standard itself. It relies on CDNs and lawsuits (https://digiday.com/media/arena-group-buzzfeed-usa-today-co-vox-media-join-rsls-ai-content-licensing-efforts/).; Errata on 2026-05-27 fixed an inconsistency between Sections 4.6 and 4.8 on canonical asset identifiers. HTML association scope was clarified on 2026-07-18 (https://rslstandard.org/rsl/errata).; Not named in the EU opt-out-protocol consultation coverage (https://cadeproject.org/updates/commission-opens-consultation-on-machine-readable-copyright-opt-out-protocols-under-the-ai-act/) [secondary].

**Watched:** changelog-page `https://rslstandard.org/rsl/errata`, changelog-page `https://github.com/rslstandard`

## TDM Reservation Protocol (TDMRep) { #tdmrep }

Not to be confused with: A W3C Community Group final report for the EU DSM Directive Art. 4 text-and-data-mining opt-out (tdm-reservation via HTTP header, /.well-known/tdmrep.json, HTML meta).

| | |
| --- | --- |
| Steward | W3C TDMRep Community Group (community) |
| Status | stable |
| Latest | [CG-FINAL 2024-05-10 2024-05-10](https://w3c.github.io/tdm-reservation-protocol) |
| Radar | **assess**: Fit decided it: stable but little used, and Unfold itself does not want to opt out; its value is as an Agency deliverable once the EU names accepted protocols. |
| Moves when | The European Commission publishes its list of machine-readable opt-out protocols and TDMRep is on it. |
| Competes with | — |
| Complements | [IETF AI Preferences (AIPREF) vocabulary and attachment](web-content.md#aipref), [Content Signals Policy (robots.txt Content-Signal)](web-content.md#content-signals), [Really Simple Licensing (RSL) 1.0](web-content.md#rsl) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| No TDM reservation on Unfold's own content | Unfold site | Record that Unfold does not reserve text-and-data-mining rights, since it wants to be read; nothing to add. | S | Avoids an opt-out that works against Unfold. |
| EU opt-out Work Item for Clients | Agency Work Item type | Proposed Work Item template: add the tdm-reservation header, /.well-known/tdmrep.json and HTML meta for a Client that wants to reserve rights under DSM Directive Article 4. | S | Gives Dutch Clients the opt-out with EU legal grounding. |
| TDM policy link for publisher Clients | Agency's Client site | Proposed: add a tdm-policy link to the Client's licensing terms, where RSL or a contract applies. | S | Points miners to the Client's terms. |
| Combined opt-out check in CI | Preview Environment | Proposed: a CI step reads TDMRep, AIPREF and Content-Signal from the preview and flags contradictions in the pull request. | S | Stops a Client from publishing conflicting signals. |
| Ploeg Runs respect TDM reservations | Ploeg Runs | Proposed: research Runs skip pages that reserve mining rights; needs a Ploeg contract. | M | Keeps Unfold's agents within EU copyright rules. |

**Shipped adoption:** W3C adopters register lists 30+ STM publishers plus trade publishers [secondary]. Bitkom reports under 3% use (https://www.bitkom.org/sites/main/files/2026-07/bitkom-statement-tdm-technical-opt-out-solutions.pdf).; The EU Commission consultation on opt-out protocols ran 2025-12-01 to 2026-01-09 (https://cadeproject.org/updates/commission-opens-consultation-on-machine-readable-copyright-opt-out-protocols-under-the-ai-act/). ABSENT: no published Commission list of accepted protocols found as of 2026-11-04.

**Open problems:** Not formal W3C standards track. Legal weight depends on the forthcoming EU list (https://www.bitkom.org/sites/main/files/2026-07/bitkom-statement-tdm-technical-opt-out-solutions.pdf).

**Watched:** changelog-page `https://w3c.github.io/tdm-reservation-protocol`

## Web Bot Auth (HTTP Message Signatures for automated traffic) { #web-bot-auth }

Not to be confused with: An IETF WG profile of RFC 9421 for bots and agents to sign requests. Visa TAP and Cloudflare verified bots use the same family.

| | |
| --- | --- |
| Steward | IETF webbotauth WG (sdo) |
| Status | draft |
| Latest | [draft-ietf-webbotauth-httpsig-protocol-01 2026-10-29](https://datatracker.ietf.org/wg/webbotauth/documents/) |
| Radar | **assess**: Maturity decided it: one working-group draft at revision -01, although the fit for Ploeg's outbound fetches is good. |
| Moves when | The webbotauth draft reaches working-group last call, or a major agent vendor signs its requests by default. |
| Competes with | — |
| Complements | [Visa Trusted Agent Protocol (TAP)](commerce.md#visa-tap), [Cloudflare AI Crawl Control (incl. Pay Per Crawl, Pay Per Use)](web-content.md#cloudflare-ai-crawl-control), [IAB Tech Lab Content Monetization Protocols (CoMP), formerly the LLM Content Ingest API](web-content.md#iab-comp) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu](../../../../../docs/adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Proposed signed fetches from Ploeg Runs | Ploeg Runs | Proposed: when a Run fetches public web pages for research, it signs requests with RFC 9421 under a published key directory, so sites can tell Unfold's agents from scrapers. Needs a generic Ploeg contract (ADR-0050 rule 8). | M | Agents are less likely to be blocked by sites that allow verified bots. |
| Verify agent callers of Unfold's API | Unfold API | Proposed: accept Web Bot Auth signatures as an extra signal for unauthenticated agent traffic to public endpoints such as the sign-up Worker (ADR-0016), never as a replacement for OAuth. | M | Separates known agents from abuse without asking them to log in. |
| Allow verified agents on a Client shop | Agency's Client webshop | Proposed Work Item template: configure the Client's CDN or WAF to allow signed agents and challenge unsigned ones, with the rules shown in the pull request. | S | Clients keep agent traffic that buys while blocking scrapers. |
| Preview Environments accept signed agents | Preview Environment | Proposed: previews behind access control (ADR-0008) admit a signed test agent, so agent-readiness Work Items can be checked by an agent in CI. | S | Agent-facing Work Items get executable Evidence before Acceptance. |
| Pay Per Crawl readiness for a publisher Client | Agency's Client site | Proposed: for a Client on Cloudflare, enable verified-bot rules that rely on signed requests, the base Pay Per Crawl needs. | S | Prepares a publisher Client for paid crawling without code in the site. |

**Shipped adoption:** Cloudflare Pay Per Crawl requires payment headers inside signed components (2025-12-10) (https://developers.cloudflare.com/ai-crawl-control/changelog/).; The Visa TAP reference implementation emits RFC 9421 signatures (https://github.com/visa/trusted-agent-protocol).

**Open problems:** Only one WG draft, at revision -01 (https://datatracker.ietf.org/wg/webbotauth/documents/).

**Watched:** ietf-draft `draft-ietf-webbotauth-httpsig-protocol` at 01
